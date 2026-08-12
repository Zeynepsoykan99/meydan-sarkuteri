#!/usr/bin/env node
/* =====================================================================
   data/products.json'u veritabanına basar.

   Çalıştırma:  npm run seed
                npm run seed -- --temiz     (önce tabloları boşaltır)

   --temiz YOKSA: yalnızca ekler. Var olan bir id ile karşılaşırsa
   HATA VERİR ve hiçbir şey yazmaz — sessizce üzerine yazmak, elle
   düzeltilmiş bir kaydı fark ettirmeden geri alabilirdi.

   --temiz VARSA: reyonlar ve urunler boşaltılır. fiyat_gecmisi de
   gider (urunler'e ON DELETE CASCADE ile bağlı) — bu bilinçli:
   ürünler yeniden yaratılırken eski fiyat geçmişi yetim kalırdı.
   ===================================================================== */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

const KOK = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEMIZ = process.argv.includes('--temiz');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('✗ DATABASE_URL tanımlı değil. .env.example dosyasına bak.');
  process.exit(1);
}

const sql = neon(url);
const veri = JSON.parse(readFileSync(join(KOK, 'data/products.json'), 'utf8'));

if (!Array.isArray(veri.reyonlar) || !Array.isArray(veri.urunler)) {
  console.error('✗ data/products.json beklenen yapıda değil');
  process.exit(1);
}

console.log(`data/products.json → ${veri.reyonlar.length} reyon, ${veri.urunler.length} ürün`);
console.log(TEMIZ ? 'mod: --temiz (önce boşaltılacak)' : 'mod: yalnızca ekleme (çakışmada hata)');

/* ---------------- ön kontrol ----------------
   Tabloya dokunmadan önce dolu mu diye bak; yarım yazıp hata vermek
   yerine baştan söyleyelim. */

const [{ mevcut }] = await sql`SELECT count(*)::int AS mevcut FROM urunler`;
if (mevcut > 0 && !TEMIZ) {
  console.error(`\n✗ urunler tablosunda zaten ${mevcut} kayıt var.`);
  console.error('  Üzerine yazmak için:  npm run seed -- --temiz');
  process.exit(1);
}

if (TEMIZ) {
  // urunler önce: reyonlar'a FK ile bağlı
  await sql`DELETE FROM urunler`;
  await sql`DELETE FROM reyonlar`;
  console.log('  tablolar boşaltıldı');
}

/* ---------------- reyonlar ---------------- */

let reyonSayisi = 0;
for (const [i, r] of veri.reyonlar.entries()) {
  await sql`
    INSERT INTO reyonlar (id, ad, ikon, sira)
    VALUES (${r.id}, ${r.ad}, ${r.ikon ?? null}, ${i})
  `;
  reyonSayisi++;
}
console.log(`  reyonlar: ${reyonSayisi} yazıldı`);

/* ---------------- ürünler ----------------
   guncellendi: JSON'daki tek damga bütün kayıtlara veriliyor. Kaynak
   veride ürün bazında tarih yok; uydurmuyoruz. */

const damga = veri.guncellendi ?? new Date().toISOString();

let urunSayisi = 0;
const hatalar = [];

for (const u of veri.urunler) {
  try {
    await sql`
      INSERT INTO urunler
        (id, ad, reyon, gorsel, fiyat, eski_fiyat, miktar, birim, stokta, kaynak, guncellendi)
      VALUES
        (${u.id}, ${u.ad}, ${u.reyon}, ${u.gorsel ?? null},
         ${u.fiyat}, ${u.eskiFiyat ?? null},
         ${u.miktar ?? null}, ${u.birim ?? null},
         ${u.stokta ?? true}, ${u.kaynak ?? null}, ${damga})
    `;
    urunSayisi++;
  } catch (e) {
    hatalar.push(`${u.id} (${u.ad}): ${e.message}`);
    if (hatalar.length >= 10) break;   // ilk 10 yeter, tablo bozuk demektir
  }
}

if (hatalar.length) {
  console.error(`\n✗ ${hatalar.length} kayıt yazılamadı${hatalar.length >= 10 ? ' (ilk 10 gösteriliyor, durduruldu)' : ''}:`);
  hatalar.forEach((h) => console.error('  ·', h));
  console.error(`\n  ${urunSayisi} ürün yazılmıştı. Temiz başlamak için: npm run seed -- --temiz`);
  process.exit(1);
}

/* ---------------- sequence'i ilerlet ----------------
   Elle id verdik, sequence bunu görmedi. Güncellemezsek yeni ürün
   var olan bir id'yi almaya çalışır ve PK çakışması verir. */

await sql`
  SELECT setval(
    'urun_id_seq',
    GREATEST((SELECT COALESCE(MAX(NULLIF(regexp_replace(id, '\\D', '', 'g'), '')::bigint), 0) FROM urunler), 1),
    true
  )
`;

const [{ sonraki }] = await sql`SELECT last_value AS sonraki FROM urun_id_seq`;

console.log(`  ürünler : ${urunSayisi} yazıldı`);
console.log(`\n✓ tamam — ${reyonSayisi} reyon, ${urunSayisi} ürün`);
console.log(`  sonraki yeni ürün id'si: u${String(Number(sonraki) + 1).padStart(3, '0')}`);
