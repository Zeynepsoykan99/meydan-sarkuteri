#!/usr/bin/env node
/* =====================================================================
   Meydan Şarküteri — veri doğrulama

   Çalıştırma:  node scripts/veri-kontrol.js

   data/products.json otomatik üretiliyor. 11 Ağustos 2026'da üretim iki
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
const VERI_YOLU = path.join(KOK, 'data/products.json');
const hatalar = [];
const uyarilar = [];

const hata = (m) => hatalar.push(m);
const uyar = (m) => uyarilar.push(m);

/* ---------------- veriyi yükle ---------------- */

let veri;
try {
  veri = JSON.parse(fs.readFileSync(VERI_YOLU, 'utf8'));
} catch (e) {
  console.error('✗ data/products.json okunamadı ya da geçerli JSON değil:', e.message);
  process.exit(1);
}

const REYONLAR = veri.reyonlar;
const URUNLER = veri.urunler;
const GUNCELLENDI = veri.guncellendi;

if (!Array.isArray(REYONLAR) || !Array.isArray(URUNLER)) {
  console.error('✗ data/products.json "reyonlar" ve "urunler" dizilerini içermiyor');
  process.exit(1);
}

const toplam = URUNLER.length;

/* ---------------- 1. yapı ----------------
   Reyon sayıları artık JSON'da tutulmuyor, buradan hesaplanıyor.
   Kontrol de buna göre değişti: "bildirilen sayı doğru mu" yerine
   "her reyonun ürünü var mı, yetim reyon kaldı mı". */

const reyonIdleri = new Set(REYONLAR.map((r) => r.id));
const sayim = {};
URUNLER.forEach((u) => { sayim[u.reyon] = (sayim[u.reyon] || 0) + 1; });

if (REYONLAR.some((r) => 'adet' in r)) {
  hata('reyonlarda "adet" alanı kalmış — bu sayı çalışma anında hesaplanıyor, veride durmamalı');
}

REYONLAR.forEach((r) => {
  if (!r.id || !r.ad || !r.ikon) hata(`reyon eksik alanlı: ${JSON.stringify(r)}`);
  if (!sayim[r.id]) hata(`"${r.id}" reyonunda hiç ürün yok — arayüzde boş sekme olarak görünür`);
});

Object.keys(sayim).forEach((id) => {
  if (!reyonIdleri.has(id)) hata(`reyonlar'da olmayan reyon: "${id}" (${sayim[id]} ürün)`);
});

const hesaplananToplam = Object.values(sayim).reduce((a, n) => a + n, 0);
if (hesaplananToplam !== toplam) {
  hata(`reyonlara dağılan ürün ${hesaplananToplam}, toplam ürün ${toplam}`);
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

const ZORUNLU = ['id', 'ad', 'reyon', 'gorsel', 'fiyat', 'eskiFiyat', 'kaynak',
                 'miktar', 'birim', 'stokta'];
const GECERLI_BIRIMLER = new Set(['kg', 'L', 'adet']);

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

  /* --- miktar / birim / stokta --- */

  if (typeof u.stokta !== 'boolean') {
    hata(`${u.id} (${u.ad}): "stokta" boolean değil → ${JSON.stringify(u.stokta)}`);
  }

  // İkisi birlikte dolu ya da birlikte boş olmalı; yarım kayıt arayüzde
  // sessizce yanlış birim fiyat üretir.
  if ((u.miktar === null) !== (u.birim === null)) {
    hata(`${u.id} (${u.ad}): miktar ve birim biri dolu biri boş → ` +
         `miktar=${JSON.stringify(u.miktar)}, birim=${JSON.stringify(u.birim)}`);
  }

  if (u.miktar !== null) {
    if (typeof u.miktar !== 'number' || !isFinite(u.miktar) || !(u.miktar > 0)) {
      hata(`${u.id} (${u.ad}): miktar pozitif sayı değil → ${JSON.stringify(u.miktar)}`);
    }
    if (!GECERLI_BIRIMLER.has(u.birim)) {
      hata(`${u.id} (${u.ad}): bilinmeyen birim "${u.birim}" ` +
           `(beklenen: ${[...GECERLI_BIRIMLER].join(', ')})`);
    }
    // "adet" tam sayı olmalı — 2,5 poşet çay diye bir şey yok
    if (u.birim === 'adet' && !Number.isInteger(u.miktar)) {
      hata(`${u.id} (${u.ad}): adet tam sayı değil → ${u.miktar}`);
    }
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

/* ---------------- 7. güncellenme damgası ---------------- */

if (!GUNCELLENDI) {
  hata('"guncellendi" tanımlı değil — sayfadaki tarih rozeti bunu okuyor');
} else if (typeof GUNCELLENDI !== 'string' || isNaN(Date.parse(GUNCELLENDI))) {
  hata(`"guncellendi" geçerli ISO 8601 değil: ${JSON.stringify(GUNCELLENDI)}`);
} else {
  const gun = Math.floor((Date.now() - Date.parse(GUNCELLENDI)) / 86400000);
  if (gun > 90) uyar(`veri ${gun} günlük — fiyatlar büyük olasılıkla eskidi`);
  if (gun < 0) hata(`"guncellendi" gelecekte: ${GUNCELLENDI}`);
}

// Damganın yalnızca tarih kısmı; sitemap ve karşılaştırmalar bunu kullanıyor
const GUNCELLENDI_GUN = typeof GUNCELLENDI === 'string' ? GUNCELLENDI.slice(0, 10) : null;

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
if (fs.existsSync(sitemapYolu) && GUNCELLENDI_GUN) {
  const m = fs.readFileSync(sitemapYolu, 'utf8').match(/<lastmod>([^<]+)<\/lastmod>/);
  if (!m) hata('sitemap.xml: <lastmod> yok');
  else if (m[1].trim().slice(0, 10) !== GUNCELLENDI_GUN) {
    hata(`sitemap.xml: lastmod ${m[1].trim()}, guncellendi ${GUNCELLENDI_GUN} — eşleşmiyor`);
  }
}

// index.html artık veriyi fetch ile alıyor; eski script etiketi kalmış olmasın
const htmlIcerik = fs.readFileSync(path.join(KOK, 'index.html'), 'utf8');
if (/<script[^>]+products\.js/.test(htmlIcerik)) {
  hata('index.html hâlâ js/products.js script etiketini içeriyor — veri artık fetch ile geliyor');
}
if (fs.existsSync(path.join(KOK, 'js/products.js'))) {
  hata('js/products.js hâlâ duruyor — veri data/products.json\'a taşındı, eski dosya silinmeli');
}

/* ---------------- rapor ---------------- */

const kaynakDagilimi = URUNLER.reduce((a, u) => (a[u.kaynak] = (a[u.kaynak] || 0) + 1, a), {});
const indirimli = URUNLER.filter((u) => u.eskiFiyat).length;
const stoktaYok = URUNLER.filter((u) => u.stokta === false).length;

const birimDagilimi = URUNLER.reduce((a, u) => {
  const k = u.birim === null ? 'yok' : u.birim;
  a[k] = (a[k] || 0) + 1;
  return a;
}, {});
const olculu = toplam - (birimDagilimi.yok || 0);

console.log('Meydan Şarküteri — veri kontrolü');
console.log('─'.repeat(52));
console.log(`ürün         ${toplam}`);
console.log(`reyon        ${REYONLAR.length}`);
console.log(`kaynak       ${Object.entries(kaynakDagilimi).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
console.log(`indirimli    ${indirimli}`);
console.log(`stokta yok   ${stoktaYok}`);
console.log(`miktar/birim ${olculu} dolu · ${birimDagilimi.yok || 0} boş  ` +
            `(kg ${birimDagilimi.kg || 0} · L ${birimDagilimi.L || 0} · adet ${birimDagilimi.adet || 0})`);
console.log(`güncellendi  ${GUNCELLENDI}`);
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
