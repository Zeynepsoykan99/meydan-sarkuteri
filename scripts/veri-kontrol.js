#!/usr/bin/env node
/* =====================================================================
   Meydan Şarküteri — veri doğrulama

   Çalıştırma:  node scripts/veri-kontrol.js

   js/products.js otomatik üretiliyor. 11 Ağustos 2026'da üretim iki
   kampanya afişini ürün sanıp katalogun içine soktu ("10-tl-urunleri",
   ₺300, Temel Gıda'nın ilk kartı). Yapısal denetim bunu yakalayamadı,
   çünkü kayıtlar teknik olarak kusursuzdu. Bu yüzden buradaki kontroller
   yapının yanında ANLAMA da bakar: ad makul mü, görsel diğerleriyle aynı
   şablonda mı, fiyat reyonuna göre çok mu sapıyor.

   Bağımlılık yok, package.json yok — bilerek. Depoya package.json
   koyarsak Vercel projeyi Node projesi sanıp build çalıştırmaya kalkar;
   oysa bu site derlenmeden servis ediliyor.

   Çıkış kodu: hata varsa 1, yalnızca uyarı varsa 0.
   ===================================================================== */

'use strict';

const fs = require('fs');
const path = require('path');

const KOK = path.join(__dirname, '..');
const hatalar = [];
const uyarilar = [];

const hata = (m) => hatalar.push(m);
const uyar = (m) => uyarilar.push(m);

/* ---------------- veriyi yükle ---------------- */

const kaynak = fs.readFileSync(path.join(KOK, 'js/products.js'), 'utf8');
let REYONLAR, URUNLER, VERI_TARIHI;
try {
  // typeof: eksik sabit dosyayı çökertmesin, aşağıda kontrol hatası olarak raporlansın
  ({ REYONLAR, URUNLER, VERI_TARIHI } = new Function(
    kaynak + `\nreturn {
      REYONLAR:    typeof REYONLAR    === 'undefined' ? undefined : REYONLAR,
      URUNLER:     typeof URUNLER     === 'undefined' ? undefined : URUNLER,
      VERI_TARIHI: typeof VERI_TARIHI === 'undefined' ? undefined : VERI_TARIHI,
    };`
  )());
} catch (e) {
  console.error('✗ js/products.js çalıştırılamadı:', e.message);
  process.exit(1);
}

if (!Array.isArray(REYONLAR) || !Array.isArray(URUNLER)) {
  console.error('✗ js/products.js REYONLAR ve URUNLER dizilerini vermiyor');
  process.exit(1);
}

const toplam = URUNLER.length;

/* ---------------- 1. yapı ---------------- */

const reyonIdleri = new Set(REYONLAR.map((r) => r.id));
const sayim = {};
URUNLER.forEach((u) => { sayim[u.reyon] = (sayim[u.reyon] || 0) + 1; });

REYONLAR.forEach((r) => {
  const gercek = sayim[r.id] || 0;
  if (r.adet !== gercek) {
    hata(`reyon sayacı tutmuyor: ${r.id} → bildirilen ${r.adet}, gerçek ${gercek}`);
  }
});

Object.keys(sayim).forEach((id) => {
  if (!reyonIdleri.has(id)) hata(`REYONLAR'da olmayan reyon: "${id}" (${sayim[id]} ürün)`);
});

const bildirilenToplam = REYONLAR.reduce((a, r) => a + r.adet, 0);
if (bildirilenToplam !== toplam) {
  hata(`reyon adetleri toplamı ${bildirilenToplam}, ürün sayısı ${toplam}`);
}

/* ---------------- 2. tekillik ---------------- */

const gorulen = {};
['id', 'ad'].forEach((alan) => {
  gorulen[alan] = new Set();
  URUNLER.forEach((u) => {
    const k = alan === 'ad' ? u.ad.toLocaleLowerCase('tr') : u[alan];
    if (gorulen[alan].has(k)) hata(`tekrarlı ${alan}: "${u[alan]}"`);
    gorulen[alan].add(k);
  });
});

/* ---------------- 3. alanlar ve fiyat mantığı ---------------- */

const ZORUNLU = ['id', 'ad', 'reyon', 'gorsel', 'fiyat', 'eskiFiyat', 'kaynak'];

URUNLER.forEach((u) => {
  ZORUNLU.forEach((alan) => {
    if (!(alan in u)) hata(`${u.id}: "${alan}" alanı yok`);
  });

  if (typeof u.fiyat !== 'number' || !(u.fiyat > 0) || !isFinite(u.fiyat)) {
    hata(`${u.id} (${u.ad}): geçersiz fiyat → ${u.fiyat}`);
  }
  if (u.eskiFiyat !== null && !(u.eskiFiyat > u.fiyat)) {
    hata(`${u.id} (${u.ad}): eskiFiyat (${u.eskiFiyat}) güncel fiyattan (${u.fiyat}) büyük değil`);
  }
  if (!u.gorsel || !/^https:\/\//.test(u.gorsel)) {
    hata(`${u.id} (${u.ad}): görsel https değil → ${u.gorsel}`);
  }
});

/* ---------------- 4. ad makullüğü ----------------
   Kazıyıcı kategori slug'ını ürün adı sanarsa buradan döner. */

URUNLER.forEach((u) => {
  const ad = u.ad;
  if (!/\s/.test(ad)) {
    hata(`${u.id}: ad tek kelime, ürün adına benzemiyor → "${ad}"`);
  }
  if (!/\p{L}/u.test(ad)) {
    hata(`${u.id}: adda hiç harf yok → "${ad}"`);
  }
  if (/^[a-z0-9]+(-[a-z0-9]+)+$/.test(ad)) {
    hata(`${u.id}: ad slug biçiminde → "${ad}"`);
  }
  if (ad !== ad.trim() || /\s{2,}/.test(ad)) {
    uyar(`${u.id}: adda fazladan boşluk → "${ad}"`);
  }
  if (ad.length < 7) {
    uyar(`${u.id}: ad çok kısa (${ad.length} karakter) → "${ad}"`);
  }
});

/* ---------------- 5. görsel şablonu ----------------
   Aynı kaynağın görselleri aynı kalıptan gelir. Sapan varsa
   büyük ihtimalle o kayıt ürün değil. */

const kalipSayaci = {};
URUNLER.forEach((u) => {
  const m = u.gorsel.match(/(\d+x\d+)/);
  const anahtar = `${u.kaynak}:${m ? m[1] : 'boyutsuz'}`;
  (kalipSayaci[anahtar] = kalipSayaci[anahtar] || []).push(u);
});

const kaynaklar = [...new Set(URUNLER.map((u) => u.kaynak))];
kaynaklar.forEach((k) => {
  const kalipar = Object.entries(kalipSayaci).filter(([a]) => a.startsWith(k + ':'));
  if (kalipar.length < 2) return;
  kalipar.sort((a, b) => b[1].length - a[1].length);
  const [baskinAd, baskin] = kalipar[0];
  kalipar.slice(1).forEach(([ad, liste]) => {
    liste.forEach((u) => {
      hata(`${u.id} (${u.ad}): görsel şablonu sapıyor → ${ad}, ` +
           `bu kaynakta beklenen ${baskinAd} (${baskin.length} üründe)`);
    });
  });
});

/* ---------------- 6. fiyat aykırılığı ----------------
   Reyonun medyanından çok sapan fiyat, yanlış eşleşmiş kayda işaret
   edebilir. Uyarı olarak veriyoruz — pahalı ürün de olabilir. */

const KAT = 12;
REYONLAR.forEach((r) => {
  const fiyatlar = URUNLER.filter((u) => u.reyon === r.id).map((u) => u.fiyat).sort((a, b) => a - b);
  if (fiyatlar.length < 5) return;
  const medyan = fiyatlar[Math.floor(fiyatlar.length / 2)];
  URUNLER.filter((u) => u.reyon === r.id).forEach((u) => {
    if (u.fiyat > medyan * KAT) {
      uyar(`${u.id} (${u.ad}): ${r.ad} medyanının (₺${medyan}) ${Math.round(u.fiyat / medyan)} katı → ₺${u.fiyat}`);
    }
  });
});

/* ---------------- 7. veri tarihi ---------------- */

if (!VERI_TARIHI) {
  hata('VERI_TARIHI tanımlı değil — sayfadaki tarih rozeti bunu okuyor');
} else if (!/^\d{4}-\d{2}-\d{2}$/.test(VERI_TARIHI) || isNaN(Date.parse(VERI_TARIHI))) {
  hata(`VERI_TARIHI geçersiz: "${VERI_TARIHI}" (YYYY-AA-GG bekleniyor)`);
} else {
  const gun = Math.floor((Date.now() - Date.parse(VERI_TARIHI)) / 86400000);
  if (gun > 90) uyar(`veri ${gun} günlük — fiyatlar büyük olasılıkla eskidi`);
}

/* ---------------- 8. dosyalar arası tutarlılık ----------------
   "223 ürün" yazısı katalog 472'ye çıktıktan sonra da HTML'de kalmıştı.
   Aynı hatanın tekrarını burada yakalıyoruz. */

const metinDosyalari = ['index.html', 'README.md'];
metinDosyalari.forEach((dosya) => {
  const icerik = fs.readFileSync(path.join(KOK, dosya), 'utf8');
  const bulunan = new Set();

  for (const m of icerik.matchAll(/(\d{2,5})\s*ürün/g)) bulunan.add(Number(m[1]));
  for (const m of icerik.matchAll(/id="vitrin-adet">(\d+)</g)) bulunan.add(Number(m[1]));

  bulunan.forEach((n) => {
    if (n !== toplam) hata(`${dosya}: "${n} ürün" yazıyor, gerçek sayı ${toplam}`);
  });

  for (const m of icerik.matchAll(/(\d+)\s*reyon/g)) {
    if (Number(m[1]) !== REYONLAR.length) {
      hata(`${dosya}: "${m[1]} reyon" yazıyor, gerçek sayı ${REYONLAR.length}`);
    }
  }
});

// sitemap'teki lastmod, veri tarihiyle aynı olmalı — sayfanın içeriği
// fiyat verisiyle birlikte değişiyor, ikisi elle senkron tutuluyor.
const sitemapYolu = path.join(KOK, 'sitemap.xml');
if (fs.existsSync(sitemapYolu) && VERI_TARIHI) {
  const m = fs.readFileSync(sitemapYolu, 'utf8').match(/<lastmod>([^<]+)<\/lastmod>/);
  if (!m) hata('sitemap.xml: <lastmod> yok');
  else if (m[1].trim() !== VERI_TARIHI) {
    hata(`sitemap.xml: lastmod ${m[1].trim()}, VERI_TARIHI ${VERI_TARIHI} — eşleşmiyor`);
  }
}

/* ---------------- rapor ---------------- */

const kaynakDagilimi = URUNLER.reduce((a, u) => (a[u.kaynak] = (a[u.kaynak] || 0) + 1, a), {});
const indirimli = URUNLER.filter((u) => u.eskiFiyat).length;

console.log('Meydan Şarküteri — veri kontrolü');
console.log('─'.repeat(52));
console.log(`ürün        ${toplam}`);
console.log(`reyon       ${REYONLAR.length}`);
console.log(`kaynak      ${Object.entries(kaynakDagilimi).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
console.log(`indirimli   ${indirimli}`);
console.log(`veri tarihi ${VERI_TARIHI}`);
console.log('─'.repeat(52));

if (uyarilar.length) {
  console.log(`\n⚠ ${uyarilar.length} uyarı`);
  uyarilar.forEach((u) => console.log('  ·', u));
}

if (hatalar.length) {
  console.log(`\n✗ ${hatalar.length} hata`);
  hatalar.forEach((h) => console.log('  ·', h));
  console.log('');
  process.exit(1);
}

console.log('\n✓ bütün kontroller geçti');
