#!/usr/bin/env node
/* =====================================================================
   data/products.json'u veritabanına basar.

   Çalıştırma:  npm run seed
                npm run seed -- --temiz     (önce tabloları boşaltır)

   --temiz YOKSA: yalnızca ekler. Tablo doluysa hata verir ve hiçbir şey
   yazmaz — sessizce üzerine yazmak, elle düzeltilmiş bir kaydı fark
   ettirmeden geri alabilirdi.

   --temiz VARSA: reyonlar ve urunler boşaltılır. fiyat_gecmisi de gider
   (urunler'e ON DELETE CASCADE ile bağlı) — bilinçli: ürünler yeniden
   yaratılırken eski fiyat geçmişi yetim kalırdı.

   Tamamı tek işlem içinde: ortada bir kayıt kısıtlara takılırsa yarım
   veri kalmaz, hepsi geri alınır. (neon() HTTP sürücüsü işlem taşımaz,
   bu yüzden aynı paketten Pool kullanıyoruz.)
   ===================================================================== */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from '@neondatabase/serverless';

const KOK = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEMIZ = process.argv.includes('--temiz');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('✗ DATABASE_URL tanımlı değil. vercel env pull .env.local');
  process.exit(1);
}

const veri = JSON.parse(readFileSync(join(KOK, 'data/products.json'), 'utf8'));
if (!Array.isArray(veri.reyonlar) || !Array.isArray(veri.urunler)) {
  console.error('✗ data/products.json beklenen yapıda değil');
  process.exit(1);
}

console.log(`data/products.json → ${veri.reyonlar.length} reyon, ${veri.urunler.length} ürün`);
console.log(TEMIZ ? 'mod: --temiz (önce boşaltılacak)' : 'mod: yalnızca ekleme (çakışmada hata)');

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

// Tabloya dokunmadan önce dolu mu diye bak
const { rows: [{ mevcut }] } = await istemci.query('SELECT count(*)::int AS mevcut FROM urunler');
if (mevcut > 0 && !TEMIZ) {
  console.error(`\n✗ urunler tablosunda zaten ${mevcut} kayıt var.`);
  console.error('  Üzerine yazmak için:  npm run seed -- --temiz');
  await bitir(1);
}

let reyonSayisi = 0;
let urunSayisi = 0;

try {
  await istemci.query('BEGIN');

  if (TEMIZ) {
    await istemci.query('DELETE FROM urunler');   // önce: reyonlar'a FK ile bağlı
    await istemci.query('DELETE FROM reyonlar');
    console.log('  tablolar boşaltıldı');
  }

  for (const [i, r] of veri.reyonlar.entries()) {
    await istemci.query(
      'INSERT INTO reyonlar (id, ad, ikon, sira) VALUES ($1, $2, $3, $4)',
      [r.id, r.ad, r.ikon ?? null, i]
    );
    reyonSayisi++;
  }
  console.log(`  reyonlar: ${reyonSayisi} yazıldı`);

  // guncellendi: JSON'daki tek damga bütün kayıtlara veriliyor. Kaynak
  // veride ürün bazında tarih yok; uydurmuyoruz.
  const damga = veri.guncellendi ?? new Date().toISOString();

  for (const u of veri.urunler) {
    await istemci.query(
      `INSERT INTO urunler
         (id, ad, reyon, gorsel, fiyat, eski_fiyat, miktar, birim, stokta, kaynak, guncellendi)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [u.id, u.ad, u.reyon, u.gorsel ?? null,
       u.fiyat, u.eskiFiyat ?? null,
       u.miktar ?? null, u.birim ?? null,
       u.stokta ?? true, u.kaynak ?? null, damga]
    );
    urunSayisi++;
  }
  console.log(`  ürünler : ${urunSayisi} yazıldı`);

  // Elle id verdik, sequence bunu görmedi. Güncellemezsek yeni ürün
  // var olan bir id'yi almaya çalışır ve PK çakışması verir.
  await istemci.query(`
    SELECT setval(
      'urun_id_seq',
      GREATEST((SELECT COALESCE(MAX(NULLIF(regexp_replace(id, '\\D', '', 'g'), '')::bigint), 0) FROM urunler), 1),
      true
    )
  `);

  await istemci.query('COMMIT');
} catch (e) {
  await istemci.query('ROLLBACK').catch(() => {});
  console.error(`\n✗ yazma başarısız, hiçbir kayıt kalmadı (ROLLBACK)`);
  console.error(`  ${e.message}`);
  if (e.detail) console.error(`  ${e.detail}`);
  if (e.constraint) console.error(`  ihlal edilen kısıt: ${e.constraint}`);
  await bitir(1);
}

/* ---------------- yazılanı say ---------------- */

const { rows: [say] } = await istemci.query(`
  SELECT
    (SELECT count(*)::int FROM reyonlar)                          AS reyon,
    (SELECT count(*)::int FROM urunler)                           AS urun,
    (SELECT count(*)::int FROM urunler WHERE eski_fiyat IS NOT NULL) AS indirimli,
    (SELECT count(*)::int FROM urunler WHERE NOT stokta)          AS stokta_yok,
    (SELECT count(*)::int FROM urunler WHERE miktar IS NOT NULL)  AS olculu
`);
const { rows: [seq] } = await istemci.query('SELECT last_value FROM urun_id_seq');

istemci.release();
await pool.end();

console.log(`\n✓ tamam`);
console.log(`  reyon      : ${say.reyon}`);
console.log(`  ürün       : ${say.urun}`);
console.log(`  indirimli  : ${say.indirimli}`);
console.log(`  stokta yok : ${say.stokta_yok}`);
console.log(`  ölçülü     : ${say.olculu}`);
console.log(`  sonraki yeni ürün id'si: u${String(Number(seq.last_value) + 1).padStart(3, '0')}`);
