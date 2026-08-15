#!/usr/bin/env node
/* =====================================================================
   Veritabanından data/products.json'u yeniden üretir.

   Çalıştırma:  npm run yedek-al

   Neden gerekli: sahibi panelden fiyat düzenlemeye başlayınca
   data/products.json eskiyor. O dosya arayüzün yedeği — API düşerse
   site ona düşüyor. Eski kalırsa site YANLIŞ fiyat gösterir; bu,
   hiç fiyat göstermemekten kötü.

   Güvenlik ağı: üretilen yük önce scripts/veri-kontrol.js'ten
   geçiriliyor. Geçmezse dosyaya DOKUNULMUYOR — bozuk bir yedek,
   eski ama tutarlı bir yedekten daha tehlikeli.
   ===================================================================== */

import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from '@neondatabase/serverless';
import { kataloguDenetle } from './veri-kontrol.js';

const KOK = join(dirname(fileURLToPath(import.meta.url)), '..');
const HEDEF = join(KOK, 'data/products.json');
const KOPYA = HEDEF + '.onceki';   // .gitignore'da

/* Çalışma dizini kirliyse uyar. Engellemiyoruz — yalnızca söylüyoruz.
   Kirli bir dizinde yedek almak, elde düzenlenmiş ama commit edilmemiş
   veriyle çalışıyor olabileceğiniz anlamına gelir. */
function gitDurumUyarisi() {
  try {
    const cikti = execFileSync('git', ['status', '--porcelain'],
      { cwd: KOK, encoding: 'utf8' }).trim();
    if (!cikti) return;
    const satirlar = cikti.split('\n');
    console.log(`\n⚠ Git çalışma dizini temiz değil (${satirlar.length} dosya):`);
    satirlar.slice(0, 8).forEach((s) => console.log('   ', s));
    if (satirlar.length > 8) console.log(`    … ve ${satirlar.length - 8} dosya daha`);
    console.log('  Değişmiş veriyle çalışıyor olabilirsiniz; yedeği commit etmeden önce bakın.\n');
  } catch { /* git yoksa ya da depo değilse sessiz geç */ }
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('✗ DATABASE_URL tanımlı değil. vercel env pull .env.local');
  process.exit(1);
}

const pool = new Pool({ connectionString: url });

// Boşta kalan bağlantı düşerse Pool 'error' fırlatıyor; dinleyicisi
// olmazsa süreç anlaşılmaz bir yığın iziyle çöküyor. Yakalayıp
// anlaşılır biçimde bildiriyoruz.
pool.on('error', (e) => {
  console.error('✗ veritabanı bağlantısı koptu:', e.message);
  process.exit(1);
});
const istemci = await pool.connect();
const bitir = async (kod) => { istemci.release(); await pool.end(); process.exit(kod); };

console.log('Veritabanından yedek alınıyor…');
gitDurumUyarisi();

const { rows: reyonlar } = await istemci.query(
  'SELECT id, ad, ikon FROM reyonlar ORDER BY sira NULLS LAST, id');

const { rows: urunler } = await istemci.query(
  `SELECT id, ad, reyon, gorsel, fiyat, eski_fiyat, miktar, birim,
          stokta, kaynak, guncellendi
     FROM urunler ORDER BY id`);

const { rows: [damga] } = await istemci.query(
  'SELECT max(guncellendi) AS en_son FROM urunler');

if (!urunler.length) {
  console.error('✗ Veritabanında hiç ürün yok. Yedek üretilmedi.');
  await bitir(1);
}

/* Yapı mevcut dosyayla BİREBİR aynı olmalı: arayüz iki kaynağı ayırt
   etmiyor. numeric sütunlar sürücüden string geliyor, sayıya çeviriyoruz. */
const sayi = (v) => (v === null || v === undefined ? null : Number(v));

const yuk = {
  guncellendi: damga.en_son ? new Date(damga.en_son).toISOString() : new Date().toISOString(),
  reyonlar: reyonlar.map((r) => ({ id: r.id, ad: r.ad, ikon: r.ikon })),
  urunler: urunler.map((u) => ({
    id: u.id,
    ad: u.ad,
    reyon: u.reyon,
    gorsel: u.gorsel,
    fiyat: sayi(u.fiyat),
    eskiFiyat: sayi(u.eski_fiyat),
    kaynak: u.kaynak,
    miktar: sayi(u.miktar),
    birim: u.birim,
    stokta: u.stokta,
  })),
};

console.log(`  ${yuk.reyonlar.length} reyon, ${yuk.urunler.length} ürün okundu`);

/* ---------------- doğrulamadan geçmeden yazma ---------------- */

const { hatalar, uyarilar } = kataloguDenetle(yuk);

if (uyarilar.length) {
  console.log(`\n⚠ ${uyarilar.length} uyarı`);
  uyarilar.forEach((u) => console.log('  ·', u));
}

if (hatalar.length) {
  console.error(`\n✗ Üretilen yük ${hatalar.length} kontrolden geçemedi:`);
  hatalar.forEach((h) => console.error('  ·', h));
  console.error('\n  data/products.json DEĞİŞTİRİLMEDİ — eski yedek yerinde duruyor.');
  await bitir(1);
}

/* ---------------- yaz ----------------
   Yazmadan önce mevcut dosyanın kopyası alınıyor. Yazma yarım kalır
   ya da sonuç bozuk çıkarsa kopyadan geri dönülüyor: bozuk bir yedek,
   eski ama tutarlı olandan tehlikeli — site ona düşünce yanlış fiyat
   gösterir. */

let oncekiBoyut = 0;
let kopyaAlindi = false;
try {
  const mevcut = readFileSync(HEDEF, 'utf8');
  oncekiBoyut = mevcut.length;
  writeFileSync(KOPYA, mevcut, 'utf8');
  kopyaAlindi = true;
} catch { /* dosya ilk kez üretiliyor olabilir */ }

try {
  writeFileSync(HEDEF, JSON.stringify(yuk, null, 2) + '\n', 'utf8');

  // Yazılanı geri okuyup yeniden denetliyoruz: kesilmiş ya da bozulmuş
  // bir yazma buradan döner.
  const geriOkunan = JSON.parse(readFileSync(HEDEF, 'utf8'));
  const { hatalar: yazmaHatalari } = kataloguDenetle(geriOkunan);
  if (yazmaHatalari.length) {
    throw new Error(`yazılan dosya denetimden geçmedi: ${yazmaHatalari[0]}`);
  }
  if (geriOkunan.urunler.length !== yuk.urunler.length) {
    throw new Error('yazılan dosyadaki ürün sayısı tutmuyor');
  }
} catch (e) {
  console.error(`\n✗ Yazma doğrulanamadı: ${e.message}`);
  if (kopyaAlindi) {
    writeFileSync(HEDEF, readFileSync(KOPYA, 'utf8'), 'utf8');
    console.error('  Önceki sürüm geri yüklendi — data/products.json bozulmadı.');
  } else {
    console.error('  Geri dönülecek bir kopya yoktu; dosya elden geçirilmeli.');
  }
  await bitir(1);
}

const yeniBoyut = readFileSync(HEDEF, 'utf8').length;
const dukkanli = yuk.urunler.filter((u) => u.kaynak === 'dukkan').length;

// Doğrulama geçtiyse kopyaya gerek yok
if (kopyaAlindi) { try { unlinkSync(KOPYA); } catch { /* önemsiz */ } }

console.log('\n✓ data/products.json güncellendi');
console.log(`  boyut       : ${oncekiBoyut} → ${yeniBoyut} bayt`);
console.log(`  guncellendi : ${yuk.guncellendi}`);
console.log(`  kaynak      : ${dukkanli} ürün "dukkan" (elle düzenlenmiş)`);
console.log('  yazma sonrası doğrulama: geçti');
console.log('\n  Not: bu dosya depoya commit edilmeli, yoksa yayındaki yedek eski kalır.');

await bitir(0);
