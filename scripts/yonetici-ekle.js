#!/usr/bin/env node
/* =====================================================================
   İlk yöneticiyi oluşturur (ya da mevcut birinin şifresini değiştirir).

   Çalıştırma:  npm run yonetici-ekle

   Şifre ARGÜMAN OLARAK ALINMAZ. Argüman kabuk geçmişine, `ps` çıktısına
   ve çoğu yerde sistem günlüklerine düşer. Bunun yerine stdin'den,
   ekrana yazılmadan okunuyor.

   Şifre ve hash hiçbir zaman ekrana basılmaz.
   ===================================================================== */

import { createInterface } from 'node:readline';
import { stdin, stdout } from 'node:process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from '@neondatabase/serverless';
import { parolaHashle } from '../api/_lib/auth.js';

const KOK = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASGARI_UZUNLUK = 12;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('✗ DATABASE_URL tanımlı değil. vercel env pull .env.local');
  process.exit(1);
}

/* ---------------- girdi okuma ----------------
   Terminalde: şifre sorulurken yankı kapatılıyor, yazarken hiçbir şey
   görünmüyor. Boru ile beslenirken: stdin bir kez baştan sona okunup
   satırlara bölünüyor.

   Neden tek kaynak: her soru için ayrı bir readline arayüzü açmak
   stdin'i tüketiyor ve ikinci soru asla cevap alamıyor — betik ilk
   soruda sonsuza kadar bekliyordu. */

let boruSatirlari = null;
let boruSirasi = 0;

async function boruyuOku() {
  if (boruSatirlari) return;
  let ham = '';
  stdin.setEncoding('utf8');
  for await (const parca of stdin) ham += parca;
  boruSatirlari = ham.split(/\r?\n/);
}

async function boruSatiri() {
  await boruyuOku();
  return boruSatirlari[boruSirasi++] ?? '';
}

async function soru(metin) {
  if (!stdin.isTTY) {
    const satir = await boruSatiri();
    stdout.write(metin + '\n');       // ne sorulduğu günlükte görünsün
    return satir.trim();
  }
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    return (await new Promise((coz) => rl.question(metin, coz))).trim();
  } finally {
    rl.close();
  }
}

async function gizliSoru(metin) {
  if (!stdin.isTTY) {
    const satir = await boruSatiri();
    stdout.write(metin + '\n');       // değeri DEĞİL, yalnızca soruyu yaz
    return satir;
  }

  return new Promise((coz, red) => {
    stdout.write(metin);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    const ETX = String.fromCharCode(3);    // Ctrl+C
    const BS  = String.fromCharCode(8);    // Backspace
    const DEL = String.fromCharCode(127);  // Delete — bazi terminaller bunu yollar

    let tampon = '';
    const dinle = (parca) => {
      for (const ch of parca) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', dinle);
          stdout.write('\n');
          return coz(tampon);
        }
        if (ch === ETX) {
          stdin.setRawMode(false);
          stdout.write('\n');
          return red(new Error('iptal edildi'));
        }
        if (ch === BS || ch === DEL) {
          tampon = tampon.slice(0, -1);
          continue;
        }
        tampon += ch;
      }
    };
    stdin.on('data', dinle);
  });
}

/* ---------------- akış ---------------- */

const pool = new Pool({ connectionString: url });
const istemci = await pool.connect();
const bitir = async (kod) => { istemci.release(); await pool.end(); process.exit(kod); };

console.log('Meydan Şarküteri — yönetici oluşturma');
console.log('─'.repeat(46));

const kullaniciAdi = await soru('Kullanıcı adı: ');
if (!kullaniciAdi) {
  console.error('✗ Kullanıcı adı boş olamaz');
  await bitir(1);
}

const { rows: mevcut } = await istemci.query(
  'SELECT id FROM yoneticiler WHERE kullanici_adi = $1', [kullaniciAdi]);

if (mevcut.length) {
  const onay = await soru(`"${kullaniciAdi}" zaten var. Şifresi değiştirilsin mi? (evet/hayir): `);
  if (onay.toLocaleLowerCase('tr') !== 'evet') {
    console.log('Vazgeçildi, hiçbir şey değişmedi.');
    await bitir(0);
  }
}

let parola = '';
for (let deneme = 1; ; deneme++) {
  const birinci = await gizliSoru(`Şifre (en az ${ASGARI_UZUNLUK} karakter): `);

  if (birinci.length < ASGARI_UZUNLUK) {
    console.error(`  ✗ En az ${ASGARI_UZUNLUK} karakter olmalı (girilen: ${birinci.length}).`);
    if (deneme >= 5) { console.error('Çok fazla deneme.'); await bitir(1); }
    continue;
  }

  const ikinci = await gizliSoru('Şifre (tekrar): ');
  if (birinci !== ikinci) {
    console.error('  ✗ Şifreler eşleşmedi, tekrar deneyin.');
    if (deneme >= 5) { console.error('Çok fazla deneme.'); await bitir(1); }
    continue;
  }

  parola = birinci;
  break;
}

// Hash ekrana BASILMAZ; yalnızca veritabanına gider.
const hash = await parolaHashle(parola);
parola = '';   // bellekteki kopyayı bırak

try {
  await istemci.query(
    `INSERT INTO yoneticiler (kullanici_adi, parola_hash)
     VALUES ($1, $2)
     ON CONFLICT (kullanici_adi)
     DO UPDATE SET parola_hash = EXCLUDED.parola_hash`,
    [kullaniciAdi, hash]
  );
} catch (e) {
  console.error('✗ Yazılamadı:', e.message);
  await bitir(1);
}

const { rows: [say] } = await istemci.query('SELECT count(*)::int AS n FROM yoneticiler');

console.log('─'.repeat(46));
console.log(`✓ "${kullaniciAdi}" ${mevcut.length ? 'güncellendi' : 'oluşturuldu'}`);
console.log(`  toplam yönetici: ${say.n}`);
await bitir(0);
