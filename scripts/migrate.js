#!/usr/bin/env node
/* =====================================================================
   db/schema.sql'i çalıştırır.

   Çalıştırma:  npm run migrate
   Gerekli:     DATABASE_URL ortam değişkeni

   Idempotenttir — iki kez çalıştırmak güvenlidir. Şema tarafında bunu
   CREATE ... IF NOT EXISTS / CREATE OR REPLACE / DROP TRIGGER IF EXISTS
   sağlıyor.

   Neden ifadeleri elle bölüyoruz: Neon'un HTTP sürücüsü (neon()) tek
   çağrıda çok ifadeli SQL kabul etmiyor. WebSocket tabanlı Pool/Client
   kabul ederdi ama Node'da ayrıca "ws" paketi gerektirebiliyor; tek
   bağımlılık kalsın diye HTTP sürücüsünde kaldık ve schema.sql'i
   "-- @@" ayırıcısından bölüyoruz. Noktalı virgülden bölmek yanlış
   olurdu: $$ ... $$ gövdeli fonksiyonların içinde de noktalı virgül var.
   ===================================================================== */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

const KOK = join(dirname(fileURLToPath(import.meta.url)), '..');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('✗ DATABASE_URL tanımlı değil.');
  console.error('  .env.example dosyasına bak; Neon panelinden bağlantı dizesini al.');
  process.exit(1);
}

const sql = neon(url);
const sema = readFileSync(join(KOK, 'db/schema.sql'), 'utf8');

// Ayırıcıya göre böl, yorum/boşluktan ibaret parçaları at
const ifadeler = sema
  .split(/^\s*--\s*@@\s*$/m)
  .map((s) => s.trim())
  .filter((s) => s && !/^(--[^\n]*\n?)*$/.test(s));

console.log(`db/schema.sql → ${ifadeler.length} ifade`);

let sira = 0;
for (const ifade of ifadeler) {
  sira++;
  // Log için ifadenin ilk anlamlı satırı
  const baslik = ifade
    .split('\n')
    .find((s) => s.trim() && !s.trim().startsWith('--'))
    ?.trim()
    .slice(0, 68) ?? '(?)';

  try {
    await sql.query(ifade);
    console.log(`  ${String(sira).padStart(2)}. ✓ ${baslik}`);
  } catch (e) {
    console.error(`  ${String(sira).padStart(2)}. ✗ ${baslik}`);
    console.error(`      ${e.message}`);
    process.exit(1);
  }
}

// Şemanın gerçekten yerinde olduğunu doğrula — sessiz başarı istemiyoruz
const [{ tablolar }] = await sql`
  SELECT count(*)::int AS tablolar
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('reyonlar', 'urunler', 'fiyat_gecmisi')
`;

if (tablolar !== 3) {
  console.error(`\n✗ Beklenen 3 tablodan ${tablolar} tanesi var.`);
  process.exit(1);
}

const [{ sonraki }] = await sql`SELECT last_value AS sonraki FROM urun_id_seq`;

console.log('\n✓ şema hazır (reyonlar, urunler, fiyat_gecmisi)');
console.log(`  urun_id_seq şu an: ${sonraki} → sonraki id u${String(Number(sonraki) + 1).padStart(3, '0')}`);
