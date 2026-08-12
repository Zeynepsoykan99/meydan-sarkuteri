#!/usr/bin/env node
/* =====================================================================
   db/schema.sql'i çalıştırır.

   Çalıştırma:  npm run migrate
   Gerekli:     DATABASE_URL (havuzlanmış Neon bağlantı dizesi)

   Idempotenttir — iki kez çalıştırmak güvenlidir. Bunu şema tarafında
   CREATE ... IF NOT EXISTS / CREATE OR REPLACE / DROP TRIGGER IF EXISTS
   sağlıyor.

   Neden neon() değil de Pool: neon() HTTP sürücüsü tek atımlık sorgular
   içindir; çok ifadeli şemayı ve BEGIN/COMMIT'i taşımaz. Pool aynı
   paketten gelir (ek bağımlılık yok) ve WebSocket üzerinden gerçek bir
   oturum açar. Node 22+ yerleşik WebSocket'i kullanıldığı için "ws"
   paketine de gerek kalmıyor.

   Şema tek bir işlem (transaction) içinde uygulanır: ortada bir ifade
   patlarsa yarım şema kalmaz, hepsi geri alınır.
   ===================================================================== */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from '@neondatabase/serverless';

const KOK = join(dirname(fileURLToPath(import.meta.url)), '..');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('✗ DATABASE_URL tanımlı değil.');
  console.error('  vercel env pull .env.local  ya da  .env.example dosyasına bak.');
  process.exit(1);
}

const sema = readFileSync(join(KOK, 'db/schema.sql'), 'utf8');

// "-- @@" ayırıcısı: ifadeleri tek tek çalıştırıp hangisinin patladığını
// söyleyebilmek için. Noktalı virgülden bölmek yanlış olurdu — $$ ... $$
// gövdeli fonksiyonların içinde de noktalı virgül var.
const ifadeler = sema
  .split(/^\s*--\s*@@\s*$/m)
  .map((s) => s.trim())
  .filter((s) => s && !/^(--[^\n]*\n?)*$/.test(s));

const baslikAl = (ifade) => ifade
  .split('\n')
  .find((s) => s.trim() && !s.trim().startsWith('--'))
  ?.trim()
  .slice(0, 66) ?? '(?)';

const pool = new Pool({ connectionString: url });
const istemci = await pool.connect();

console.log(`db/schema.sql → ${ifadeler.length} ifade (tek işlem içinde)`);

try {
  await istemci.query('BEGIN');

  let sira = 0;
  for (const ifade of ifadeler) {
    sira++;
    try {
      await istemci.query(ifade);
      console.log(`  ${String(sira).padStart(2)}. ✓ ${baslikAl(ifade)}`);
    } catch (e) {
      console.error(`  ${String(sira).padStart(2)}. ✗ ${baslikAl(ifade)}`);
      console.error(`      ${e.message}`);
      throw e;
    }
  }

  await istemci.query('COMMIT');
} catch (e) {
  await istemci.query('ROLLBACK').catch(() => {});
  console.error('\n✗ şema uygulanamadı, hiçbir değişiklik yazılmadı (ROLLBACK)');
  istemci.release();
  await pool.end();
  process.exit(1);
}

/* ---------------- doğrulama ----------------
   Sessiz başarı istemiyoruz: tablolar gerçekten yerinde mi, bakalım. */

const { rows: [sayim] } = await istemci.query(`
  SELECT count(*)::int AS tablolar
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('reyonlar', 'urunler', 'fiyat_gecmisi')
`);

const { rows: [kisit] } = await istemci.query(`
  SELECT count(*)::int AS adet
  FROM pg_constraint
  WHERE conrelid = 'urunler'::regclass AND contype = 'c'
`);

const { rows: [trig] } = await istemci.query(`
  SELECT count(*)::int AS adet
  FROM pg_trigger
  WHERE tgrelid = 'urunler'::regclass AND NOT tgisinternal
`);

const { rows: [seq] } = await istemci.query('SELECT last_value FROM urun_id_seq');

istemci.release();
await pool.end();

if (sayim.tablolar !== 3) {
  console.error(`\n✗ Beklenen 3 tablodan ${sayim.tablolar} tanesi var.`);
  process.exit(1);
}

console.log('\n✓ şema hazır');
console.log(`  tablolar     : reyonlar, urunler, fiyat_gecmisi`);
console.log(`  CHECK kısıtı : ${kisit.adet} (urunler üzerinde)`);
console.log(`  trigger      : ${trig.adet}`);
console.log(`  urun_id_seq  : ${seq.last_value} → sonraki id u${String(Number(seq.last_value) + 1).padStart(3, '0')}`);
