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
import { writeFileSync, chmodSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomInt } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from '@neondatabase/serverless';
import { parolaHashle } from '../api/_lib/auth.js';

const KOK = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASGARI_UZUNLUK = 12;
const GECICI = process.argv.includes('--gecici');
const GECICI_DOSYA = join(KOK, '.gecici-sifre.txt');

/* Karışabilecek karakterler bilerek yok: 0/O, 1/l/I.
   Şifre telefondan elle girilecek, okunabilirlik güvenlikten
   daha çok işe yarıyor — 20 karakter bu alfabede ~103 bit entropi
   veriyor, fazlasıyla yeterli. */
const ALFABE = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const GECICI_UZUNLUK = 20;

function geciciSifreUret() {
  let s = '';
  // randomInt kriptografik; Math.random asla kullanılmaz
  for (let i = 0; i < GECICI_UZUNLUK; i++) s += ALFABE[randomInt(ALFABE.length)];
  return s;
}

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
// Boşta kalan bağlantı düşerse Pool 'error' fırlatıyor; dinleyicisi
// olmazsa süreç anlaşılmaz bir yığın iziyle çöküyor. Yakalayıp
// anlaşılır biçimde bildiriyoruz.
pool.on('error', (e) => {
  console.error('✗ veritabanı bağlantısı koptu:', e.message);
  process.exit(1);
});
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

if (GECICI) {
  // Şifre üretiliyor ve YALNIZCA dosyaya yazılıyor. Ekrana, log'a ya da
  // komut çıktısına asla düşmüyor — terminal geçmişinde kalmasın diye.
  parola = geciciSifreUret();
} else {
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
}

// Hash ekrana BASILMAZ; yalnızca veritabanına gider.
const hash = await parolaHashle(parola);

try {
  await istemci.query(
    `INSERT INTO yoneticiler (kullanici_adi, parola_hash, sifre_degistirmeli)
     VALUES ($1, $2, $3)
     ON CONFLICT (kullanici_adi)
     DO UPDATE SET parola_hash = EXCLUDED.parola_hash,
                   sifre_degistirmeli = EXCLUDED.sifre_degistirmeli`,
    [kullaniciAdi, hash, GECICI]
  );
} catch (e) {
  console.error('✗ Yazılamadı:', e.message);
  await bitir(1);
}

/* ---------------- geçici şifre dosyası ----------------
   Şifre buraya, yalnızca buraya yazılıyor.

   İzin: POSIX'te 0600 yeterli. Windows'ta chmod POSIX bitlerini
   uygulamıyor (dosya 644 görünüyor), o yüzden orada icacls ile
   devralınan izinler kaldırılıp yalnızca mevcut kullanıcıya tam yetki
   veriliyor. Başarısız olursa uyarı basılıyor — sessizce "korundu"
   varsayımı yapmıyoruz. */

function izinleriKisitla(yol) {
  if (process.platform !== 'win32') {
    try { chmodSync(yol, 0o600); return { tamam: true, yontem: 'chmod 0600' }; }
    catch (e) { return { tamam: false, yontem: 'chmod', hata: e.message }; }
  }
  const kullanici = process.env.USERNAME || process.env.USER;
  if (!kullanici) return { tamam: false, yontem: 'icacls', hata: 'kullanıcı adı okunamadı' };
  try {
    execFileSync('icacls', [yol, '/inheritance:r', '/grant:r', `${kullanici}:F`],
      { stdio: 'ignore' });
    return { tamam: true, yontem: 'icacls (yalnızca ' + kullanici + ')' };
  } catch (e) {
    return { tamam: false, yontem: 'icacls', hata: e.message };
  }
}

if (GECICI) {
  const icerik =
    `Meydan Sarkuteri — gecici yonetici sifresi\n` +
    `${'='.repeat(46)}\n` +
    `Kullanici adi : ${kullaniciAdi}\n` +
    `Gecici sifre  : ${parola}\n` +
    `${'='.repeat(46)}\n` +
    `Bu sifre ILK GIRISTE degistirilecek; panel baska bir sey\n` +
    `yapmaniza izin vermez. Degistirdikten SONRA bu dosyayi silin.\n` +
    `Dosya .gitignore ve .vercelignore icinde: depoya ve yayina girmez.\n`;

  writeFileSync(GECICI_DOSYA, icerik, { mode: 0o600 });
  var izin = izinleriKisitla(GECICI_DOSYA);
}

parola = '';   // bellekteki kopyayı bırak

const { rows: [say] } = await istemci.query('SELECT count(*)::int AS n FROM yoneticiler');

console.log('─'.repeat(46));
console.log(`✓ "${kullaniciAdi}" ${mevcut.length ? 'güncellendi' : 'oluşturuldu'}`);
if (GECICI) {
  // Şifre BURADA DA yazılmıyor; yalnızca nerede olduğu söyleniyor.
  console.log('  Hesap oluşturuldu, şifre .gecici-sifre.txt dosyasında');
  console.log('  Dosya izni: ' + (izin.tamam ? izin.yontem : 'KISITLANAMADI (' + izin.yontem + ': ' + izin.hata + ') — dosyayı elle koruyun'));
  console.log('  İlk girişte değiştirilmesi zorunlu.');
}
console.log(`  toplam yönetici: ${say.n}`);
await bitir(0);
