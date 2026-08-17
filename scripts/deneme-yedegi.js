#!/usr/bin/env node
/* =====================================================================
   Deneme güvenlik ağı — urunler tablosunun tam kopyası ve geri yükleme.

   Panel denemesi sırasında sahibi ne yaparsa yapsın tek komutla
   sınama öncesine dönülebilsin diye. Yedek dosyası .deneme-yedek.json,
   .gitignore'da.

     node scripts/deneme-yedegi.js al       kopya çıkar
     node scripts/deneme-yedegi.js dogrula  kopyayı denetle
     node scripts/deneme-yedegi.js geri     kopyadan geri yükle
     node scripts/deneme-yedegi.js sina     al → boz → geri → karşılaştır

   Geri yükleme fiyat, eski_fiyat, miktar, birim, stokta, kaynak ve
   guncellendi alanlarını döndürür, fiyat_gecmisi'ni boşaltır.
   Yöneticilere ve oturumlara DOKUNMAZ.
   ===================================================================== */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { Pool } from '@neondatabase/serverless';

const YOL = new URL('../.deneme-yedek.json', import.meta.url);
const ALANLAR = ['fiyat', 'eski_fiyat', 'miktar', 'birim', 'stokta', 'kaynak', 'guncellendi'];
const BEKLENEN_ADET = 470;

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL yok. .env.local yüklendi mi?');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on('error', (e) => console.error('[pool]', e.message));

const SEC = `SELECT id, ${ALANLAR.join(', ')} FROM urunler ORDER BY id`;

/* Karşılaştırma için tek biçim. pg timestamptz'i Date, numeric'i metin
   döndürüyor; JSON'a yazılınca Date metne dönüyor. İkisi de aynı kalıba
   girmezse birebir aynı veri farklı görünür. */
const duz = (v) => {
  if (v === null || v === undefined) return 'null';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v)) return new Date(v).toISOString();
  if (typeof v === 'number' || /^-?\d+(\.\d+)?$/.test(String(v))) return String(Number(v));
  return String(v);
};

async function al() {
  const { rows } = await pool.query(SEC);
  const paket = { alindi: new Date().toISOString(), adet: rows.length, urunler: rows };
  writeFileSync(YOL, JSON.stringify(paket, null, 2), 'utf8');
  console.log(`kopya alındı: ${rows.length} ürün → ${YOL.pathname.replace(/^\//, '')}`);
  return paket;
}

function oku() {
  if (!existsSync(YOL)) { console.error('kopya yok. önce "al" çalıştır.'); process.exit(1); }
  return JSON.parse(readFileSync(YOL, 'utf8'));
}

/** Kopya güvenilir mi? Eksik alan, eksik ürün, bozuk değer var mı. */
function dogrula(paket, sessiz = false) {
  const sorun = [];
  const yaz = (m) => { if (!sessiz) console.log(m); };

  if (paket.adet !== paket.urunler.length) sorun.push('adet alanı listeyle uyuşmuyor');
  if (paket.urunler.length !== BEKLENEN_ADET) {
    sorun.push(`${paket.urunler.length} ürün var, ${BEKLENEN_ADET} bekleniyordu`);
  }

  const kimlikler = new Set();
  let bosFiyat = 0, bosKimlik = 0, eksikAlan = 0;
  for (const u of paket.urunler) {
    if (!u.id) { bosKimlik++; continue; }
    kimlikler.add(u.id);
    // Alanlar VAR MI — null olabilirler, ama anahtar bulunmalı
    for (const a of ALANLAR) if (!(a in u)) eksikAlan++;
    if (u.fiyat === null || u.fiyat === undefined || Number(u.fiyat) <= 0) bosFiyat++;
  }
  if (bosKimlik) sorun.push(`${bosKimlik} üründe id yok`);
  if (eksikAlan) sorun.push(`${eksikAlan} alan eksik`);
  if (bosFiyat) sorun.push(`${bosFiyat} üründe geçersiz fiyat`);
  if (kimlikler.size !== paket.urunler.length) sorun.push('yinelenen id var');

  yaz(`  ürün       : ${paket.urunler.length}`);
  yaz(`  benzersiz id: ${kimlikler.size}`);
  yaz(`  alan/ürün  : ${ALANLAR.length} (${ALANLAR.join(', ')})`);
  yaz(`  fiyatı olan: ${paket.urunler.length - bosFiyat}`);
  yaz(`  alındı     : ${paket.alindi}`);

  if (sorun.length) {
    yaz('\n  SORUNLAR:');
    sorun.forEach((x) => yaz(`   ✗ ${x}`));
  } else {
    yaz('\n  ✓ kopya eksiksiz');
  }
  return sorun;
}

async function geri(paket = oku()) {
  const sorun = dogrula(paket, true);
  if (sorun.length) {
    console.error('kopya bozuk, geri yükleme YAPILMADI:');
    sorun.forEach((x) => console.error(`  ✗ ${x}`));
    process.exit(1);
  }

  // Satır satır UPDATE 940 gidiş-dönüş demekti, bağlantı düşüyordu.
  // Dizileri unnest ile tek sorguya veriyoruz: üç sorgu, tek işlem.
  const s = (alan) => paket.urunler.map((u) => u[alan]);
  const idler = s('id');
  const damgalar = s('guncellendi');

  const istemci = await pool.connect();
  try {
    await istemci.query('BEGIN');

    // 1) Bütün alanlar. Fiyatı değişen satırlarda tetikleyici devreye girip
    //    guncellendi'yi now() yapacak ve fiyat_gecmisi'ne kayıt atacak.
    await istemci.query(
      `UPDATE urunler u SET
         fiyat = v.fiyat, eski_fiyat = v.eski_fiyat, miktar = v.miktar,
         birim = v.birim, stokta = v.stokta, kaynak = v.kaynak
       FROM (SELECT * FROM unnest(
               $1::text[], $2::numeric[], $3::numeric[], $4::numeric[],
               $5::text[], $6::boolean[], $7::text[]
             ) AS t(id, fiyat, eski_fiyat, miktar, birim, stokta, kaynak)) v
       WHERE u.id = v.id`,
      [idler, s('fiyat'), s('eski_fiyat'), s('miktar'), s('birim'), s('stokta'), s('kaynak')]);

    // 2) Damgayı geri koy. Tetikleyici "BEFORE UPDATE OF fiyat" olduğu için
    //    fiyat SET listesinde olmayınca hiç çalışmıyor.
    await istemci.query(
      `UPDATE urunler u SET guncellendi = v.g
       FROM (SELECT * FROM unnest($1::text[], $2::timestamptz[]) AS t(id, g)) v
       WHERE u.id = v.id AND u.guncellendi IS DISTINCT FROM v.g`,
      [idler, damgalar]);

    // 3) Geri yükleme sırasında oluşan geçmiş kayıtları da dahil, hepsi silinir
    await istemci.query('DELETE FROM fiyat_gecmisi');

    await istemci.query('COMMIT');
  } catch (e) {
    await istemci.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    istemci.release();
  }
  console.log(`geri yüklendi: ${paket.urunler.length} ürün, fiyat_gecmisi boşaltıldı`);
}

/** Geri yüklemeyi fiilen sına: bir ürünü boz, geri yükle, karşılaştır. */
async function sina() {
  console.log('1) kopya alınıyor');
  const paket = await al();

  console.log('\n2) kopya denetleniyor');
  if (dogrula(paket).length) process.exit(1);

  const denek = paket.urunler[0];
  console.log(`\n3) "${denek.id}" bozuluyor (bütün alanlar değiştiriliyor)`);
  console.log(`   önce: fiyat=${denek.fiyat} eski=${denek.eski_fiyat} miktar=${denek.miktar} ` +
              `birim=${denek.birim} stokta=${denek.stokta} kaynak=${denek.kaynak}`);
  await pool.query(
    `UPDATE urunler SET fiyat=$1, eski_fiyat=$2, miktar=$3, birim=$4,
                        stokta=$5, kaynak=$6 WHERE id=$7`,
    [1.23, 9.99, 7.5, 'kg', false, 'dukkan', denek.id]);
  // fiyat_gecmisi kaydını tetikleyici kendisi atıyor (fiyat değişti)

  const { rows: [bozuk] } = await pool.query(`SELECT ${ALANLAR.join(', ')} FROM urunler WHERE id=$1`, [denek.id]);
  console.log(`   sonra: fiyat=${bozuk.fiyat} eski=${bozuk.eski_fiyat} miktar=${bozuk.miktar} ` +
              `birim=${bozuk.birim} stokta=${bozuk.stokta} kaynak=${bozuk.kaynak}`);
  const { rows: [g1] } = await pool.query('SELECT count(*) n FROM fiyat_gecmisi');
  console.log(`   fiyat_gecmisi: ${g1.n} kayıt`);

  console.log('\n4) geri yükleniyor');
  await geri(paket);

  console.log('\n5) karşılaştırma');
  const { rows: [simdi] } = await pool.query(`SELECT ${ALANLAR.join(', ')} FROM urunler WHERE id=$1`, [denek.id]);
  let hata = 0;
  for (const a of ALANLAR) {
    const bek = duz(denek[a]), bul = duz(simdi[a]);
    const esit = bek === bul;
    console.log(`   ${esit ? '✓' : '✗'} ${a.padEnd(12)} ${bul}`);
    if (!esit) { hata++; console.log(`       beklenen: ${bek}`); }
  }
  const { rows: [g2] } = await pool.query('SELECT count(*) n FROM fiyat_gecmisi');
  const gecmisTemiz = Number(g2.n) === 0;
  console.log(`   ${gecmisTemiz ? '✓' : '✗'} fiyat_gecmisi boş (${g2.n})`);
  if (!gecmisTemiz) hata++;

  // Tablonun tamamı da kopyayla birebir mi?
  const { rows: hepsi } = await pool.query(SEC);
  const fark = hepsi.filter((r, i) =>
    r.id !== paket.urunler[i].id || ALANLAR.some((a) => duz(paket.urunler[i][a]) !== duz(r[a])));
  console.log(`   ${fark.length === 0 ? '✓' : '✗'} tablonun tamamı kopyayla aynı (${hepsi.length} ürün, ${fark.length} fark)`);
  if (fark.length) { hata++; console.log(`       ilk farklar: ${fark.slice(0, 3).map((x) => x.id).join(', ')}`); }

  console.log(hata === 0
    ? '\n✓ GÜVENLİK AĞI ÇALIŞIYOR — geri yükleme birebir döndürüyor'
    : `\n✗ ${hata} sorun — güvenlik ağına GÜVENME`);
  return hata;
}

const komut = process.argv[2];
try {
  if (komut === 'al') await al();
  else if (komut === 'dogrula') dogrula(oku());
  else if (komut === 'geri') await geri();
  else if (komut === 'sina') process.exitCode = (await sina()) === 0 ? 0 : 1;
  else {
    console.log('kullanım: node scripts/deneme-yedegi.js al|dogrula|geri|sina');
    process.exitCode = 1;
  }
} finally {
  await pool.end();
}
