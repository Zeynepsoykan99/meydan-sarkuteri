#!/usr/bin/env node
/* =====================================================================
   Meydan Şarküteri — katalog doğrulama

   İki şekilde kullanılır:

   1) Betik olarak
        node scripts/veri-kontrol.js              data/products.json'u denetler
        node scripts/veri-kontrol.js --api        canlı /api/katalog yanıtını denetler
        node scripts/veri-kontrol.js --api=URL    başka bir adresi denetler

   2) Modül olarak
        import { kataloguDenetle } from './scripts/veri-kontrol.js';
        const { hatalar, uyarilar } = kataloguDenetle(yuk);

   İkinci kullanım ileride panel içindir: panelden gelen kayıtlar da
   dosyadan gelenle aynı denetimden geçsin, iki yerde iki ayrı doğruluk
   tanımı olmasın.

   Kontroller yapının yanında ANLAMA da bakar. 11 Ağustos 2026'da veri
   üretimi iki kampanya afişini ürün sanıp katalogun içine soktu
   ("10-tl-urunleri", ₺300, Temel Gıda'nın ilk kartı). Yapısal denetim
   bunları yakalayamamıştı: kayıtlar teknik olarak kusursuzdu — alan
   eksiği yok, fiyat geçerli, id tekil. Ad makullüğü ve görsel şablonu
   kontrolleri o yüzden var.

   Çıkış kodu: hata varsa 1, yalnızca uyarı varsa 0.
   ===================================================================== */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = join(dirname(fileURLToPath(import.meta.url)), '..');

export const GECERLI_BIRIMLER = new Set(['kg', 'L', 'adet']);
const ZORUNLU_ALANLAR = ['id', 'ad', 'reyon', 'gorsel', 'fiyat', 'eskiFiyat',
                         'kaynak', 'miktar', 'birim', 'stokta'];

/* =====================================================================
   Yük doğrulama — dosyadan da API'den de panelden de gelse aynı kurallar
   ===================================================================== */

export function kataloguDenetle(veri) {
  const hatalar = [];
  const uyarilar = [];
  const hata = (m) => hatalar.push(m);
  const uyar = (m) => uyarilar.push(m);

  if (!veri || typeof veri !== 'object') {
    return { hatalar: ['yük bir nesne değil'], uyarilar, ozet: null };
  }

  const REYONLAR = veri.reyonlar;
  const URUNLER = veri.urunler;

  if (!Array.isArray(REYONLAR) || !Array.isArray(URUNLER)) {
    return { hatalar: ['yükte "reyonlar" ve "urunler" dizileri yok'], uyarilar, ozet: null };
  }

  const toplam = URUNLER.length;

  /* ---------------- 1. reyon yapısı ----------------
     Reyon başına ürün sayısı artık veride tutulmuyor, hesaplanıyor.
     Kontrol de buna göre: "bildirilen sayı doğru mu" yerine "her
     reyonun ürünü var mı, yetim reyon kaldı mı". */

  const reyonIdleri = new Set(REYONLAR.map((r) => r.id));
  const sayim = {};
  URUNLER.forEach((u) => { sayim[u.reyon] = (sayim[u.reyon] || 0) + 1; });

  if (REYONLAR.some((r) => 'adet' in r)) {
    hata('reyonlarda "adet" alanı kalmış — bu sayı çalışma anında hesaplanıyor, veride durmamalı');
  }

  REYONLAR.forEach((r) => {
    if (!r.id || !r.ad) hata(`reyon eksik alanlı: ${JSON.stringify(r)}`);
    if (!sayim[r.id]) hata(`"${r.id}" reyonunda hiç ürün yok — arayüzde boş sekme olarak görünür`);
  });

  Object.keys(sayim).forEach((id) => {
    if (!reyonIdleri.has(id)) hata(`reyonlar'da olmayan reyon: "${id}" (${sayim[id]} ürün)`);
  });

  /* ---------------- 2. tekillik ---------------- */

  ['id', 'ad'].forEach((alan) => {
    const gorulen = new Set();
    URUNLER.forEach((u) => {
      const k = alan === 'ad' ? String(u.ad).toLocaleLowerCase('tr') : u[alan];
      if (gorulen.has(k)) hata(`tekrarlı ${alan}: "${u[alan]}"`);
      gorulen.add(k);
    });
  });

  /* ---------------- 3. alanlar, fiyat mantığı, yeni alanlar ---------------- */

  URUNLER.forEach((u) => {
    ZORUNLU_ALANLAR.forEach((alan) => {
      if (!(alan in u)) hata(`${u.id}: "${alan}" alanı yok`);
    });

    if (typeof u.fiyat !== 'number' || !(u.fiyat > 0) || !isFinite(u.fiyat)) {
      hata(`${u.id} (${u.ad}): geçersiz fiyat → ${u.fiyat}`);
    }
    if (u.eskiFiyat !== null && u.eskiFiyat !== undefined && !(u.eskiFiyat > u.fiyat)) {
      hata(`${u.id} (${u.ad}): eskiFiyat (${u.eskiFiyat}) güncel fiyattan (${u.fiyat}) büyük değil`);
    }
    if (!u.gorsel || !/^https:\/\//.test(u.gorsel)) {
      hata(`${u.id} (${u.ad}): görsel https değil → ${u.gorsel}`);
    }

    if (typeof u.stokta !== 'boolean') {
      hata(`${u.id} (${u.ad}): "stokta" boolean değil → ${JSON.stringify(u.stokta)}`);
    }

    // İkisi birlikte dolu ya da birlikte boş olmalı; yarım kayıt arayüzde
    // sessizce yanlış birim fiyat üretir.
    if ((u.miktar === null) !== (u.birim === null)) {
      hata(`${u.id} (${u.ad}): miktar ve birim biri dolu biri boş → ` +
           `miktar=${JSON.stringify(u.miktar)}, birim=${JSON.stringify(u.birim)}`);
    }

    if (u.miktar !== null && u.miktar !== undefined) {
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
    const ad = String(u.ad ?? '');
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
    const m = String(u.gorsel ?? '').match(/(\d+x\d+)/);
    const anahtar = `${u.kaynak}:${m ? m[1] : 'boyutsuz'}`;
    (kalipSayaci[anahtar] = kalipSayaci[anahtar] || []).push(u);
  });

  [...new Set(URUNLER.map((u) => u.kaynak))].forEach((k) => {
    const kaliplar = Object.entries(kalipSayaci).filter(([a]) => a.startsWith(k + ':'));
    if (kaliplar.length < 2) return;
    kaliplar.sort((a, b) => b[1].length - a[1].length);
    const [baskinAd, baskin] = kaliplar[0];
    kaliplar.slice(1).forEach(([ad, liste]) => {
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
    const reyonUrunleri = URUNLER.filter((u) => u.reyon === r.id);
    const fiyatlar = reyonUrunleri.map((u) => u.fiyat).sort((a, b) => a - b);
    if (fiyatlar.length < 5) return;
    const medyan = fiyatlar[Math.floor(fiyatlar.length / 2)];
    reyonUrunleri.forEach((u) => {
      if (u.fiyat > medyan * KAT) {
        uyar(`${u.id} (${u.ad}): ${r.ad} medyanının (₺${medyan}) ${Math.round(u.fiyat / medyan)} katı → ₺${u.fiyat}`);
      }
    });
  });

  /* ---------------- 7. güncellenme damgası ---------------- */

  const GUNCELLENDI = veri.guncellendi;
  if (!GUNCELLENDI) {
    hata('"guncellendi" tanımlı değil — sayfadaki tarih rozeti bunu okuyor');
  } else if (typeof GUNCELLENDI !== 'string' || isNaN(Date.parse(GUNCELLENDI))) {
    hata(`"guncellendi" geçerli ISO 8601 değil: ${JSON.stringify(GUNCELLENDI)}`);
  } else {
    const gun = Math.floor((Date.now() - Date.parse(GUNCELLENDI)) / 86400000);
    if (gun > 90) uyar(`veri ${gun} günlük — fiyatlar büyük olasılıkla eskidi`);
    if (gun < 0) hata(`"guncellendi" gelecekte: ${GUNCELLENDI}`);
  }

  /* ---------------- özet ---------------- */

  const birimDagilimi = URUNLER.reduce((a, u) => {
    const k = (u.birim === null || u.birim === undefined) ? 'yok' : u.birim;
    a[k] = (a[k] || 0) + 1;
    return a;
  }, {});

  const ozet = {
    urun: toplam,
    reyon: REYONLAR.length,
    kaynak: URUNLER.reduce((a, u) => (a[u.kaynak] = (a[u.kaynak] || 0) + 1, a), {}),
    indirimli: URUNLER.filter((u) => u.eskiFiyat).length,
    stoktaYok: URUNLER.filter((u) => u.stokta === false).length,
    birim: birimDagilimi,
    guncellendi: GUNCELLENDI,
  };

  return { hatalar, uyarilar, ozet };
}

/* =====================================================================
   Dosya sistemine bakan kontroller — yalnızca yerel depoda anlamlı,
   bu yüzden yük doğrulamasının dışında. Panelden gelen bir kayıt için
   karşılaştırılacak dosya yok.
   ===================================================================== */

export function dosyalarariDenetle(veri) {
  const hatalar = [];
  const toplam = veri.urunler.length;
  const reyonSayisi = veri.reyonlar.length;
  const damgaGun = typeof veri.guncellendi === 'string' ? veri.guncellendi.slice(0, 10) : null;

  // "223 ürün" yazısı katalog 472'ye çıktıktan sonra da HTML'de kalmıştı.
  ['index.html', 'README.md'].forEach((dosya) => {
    const yol = join(KOK, dosya);
    if (!existsSync(yol)) return;
    const icerik = readFileSync(yol, 'utf8');

    const bulunan = new Set();
    for (const m of icerik.matchAll(/(\d{2,5})\s*ürün/g)) bulunan.add(Number(m[1]));
    for (const m of icerik.matchAll(/id="vitrin-adet">(\d+)</g)) bulunan.add(Number(m[1]));

    bulunan.forEach((n) => {
      if (n !== toplam) hatalar.push(`${dosya}: "${n} ürün" yazıyor, gerçek sayı ${toplam}`);
    });

    for (const m of icerik.matchAll(/(\d+)\s*reyon/g)) {
      if (Number(m[1]) !== reyonSayisi) {
        hatalar.push(`${dosya}: "${m[1]} reyon" yazıyor, gerçek sayı ${reyonSayisi}`);
      }
    }
  });

  // sitemap lastmod, veri tarihiyle hizalı olmalı
  const sitemapYolu = join(KOK, 'sitemap.xml');
  if (existsSync(sitemapYolu) && damgaGun) {
    const m = readFileSync(sitemapYolu, 'utf8').match(/<lastmod>([^<]+)<\/lastmod>/);
    if (!m) hatalar.push('sitemap.xml: <lastmod> yok');
    else if (m[1].trim().slice(0, 10) !== damgaGun) {
      hatalar.push(`sitemap.xml: lastmod ${m[1].trim()}, guncellendi ${damgaGun} — eşleşmiyor`);
    }
  }

  // veri fetch ile geliyor; eski script etiketi ve dosya kalmış olmasın
  const htmlYolu = join(KOK, 'index.html');
  if (existsSync(htmlYolu) && /<script[^>]+products\.js/.test(readFileSync(htmlYolu, 'utf8'))) {
    hatalar.push('index.html hâlâ js/products.js script etiketini içeriyor — veri artık fetch ile geliyor');
  }
  if (existsSync(join(KOK, 'js/products.js'))) {
    hatalar.push("js/products.js hâlâ duruyor — veri data/products.json'a taşındı, eski dosya silinmeli");
  }

  return hatalar;
}

/* =====================================================================
   Dükkân bilgileri — data/dukkan.json

   Bu dosyanın örnek saatleri ÇALIŞIR değerler taşıyor: bayrak açılmadan
   yayına giderse ziyaretçi yanlış saat görür ve hiçbir yerde
   "DOLDURULACAK" yazmaz. Bayrak açıkken içeride kalıntı bırakılmadığını
   burada denetliyoruz.
   ===================================================================== */

export function dukkanDenetle(veri) {
  const hatalar = [];
  const uyarilar = [];

  if (!veri || typeof veri !== 'object') {
    return { hatalar: ['dukkan.json okunamadı ya da nesne değil'], uyarilar };
  }

  if (veri.dolduruldu !== true) {
    uyarilar.push('dukkan.json henüz doldurulmadı (dolduruldu:false) — ' +
                  'dükkân bilgileri ziyaretçiye gösterilmiyor');
    return { hatalar, uyarilar };
  }

  // Bayrak açık: artık hiçbir yerde kalıntı kalmamalı
  const kalintilar = [];
  const gez = (deger, yol) => {
    if (typeof deger === 'string') {
      if (/DOLDURULACAK/i.test(deger)) kalintilar.push(yol);
    } else if (Array.isArray(deger)) {
      deger.forEach((x, i) => gez(x, `${yol}[${i}]`));
    } else if (deger && typeof deger === 'object') {
      for (const [k, v] of Object.entries(deger)) {
        if (k.startsWith('_')) continue;          // açıklama alanları
        gez(v, yol ? `${yol}.${k}` : k);
      }
    }
  };
  gez(veri, '');
  if (kalintilar.length) {
    hatalar.push(`dolduruldu:true ama "DOLDURULACAK" kalmış: ${kalintilar.join(', ')}`);
  }

  const dolu = (v) => typeof v === 'string' && v.trim() !== '';
  const a = veri.adres || {};
  if (!dolu(a.satir)) hatalar.push('adres.satir boş');
  if (!dolu(a.ilce) && !dolu(a.il)) hatalar.push('adres.ilce ve adres.il ikisi de boş');
  if (!dolu(veri.ad)) hatalar.push('ad boş');

  const tel = (veri.iletisim || {}).telefon;
  if (!dolu(tel)) hatalar.push('iletisim.telefon boş');
  else if (String(tel).replace(/\D/g, '').length < 10) {
    hatalar.push(`iletisim.telefon çok kısa: "${tel}"`);
  }

  const wa = (veri.iletisim || {}).whatsapp;
  if (dolu(wa) && String(wa).replace(/\D/g, '').length < 10) {
    hatalar.push(`iletisim.whatsapp çok kısa: "${wa}"`);
  }
  if (!dolu(wa)) uyarilar.push('iletisim.whatsapp boş — WhatsApp düğmesi çıkmayacak');
  if (!dolu(a.haritaUrl)) uyarilar.push('adres.haritaUrl boş — harita bağlantısı çıkmayacak');

  const saatler = Array.isArray(veri.saatler) ? veri.saatler : [];
  if (!saatler.length) {
    uyarilar.push('saatler boş — açık/kapalı göstergesi çıkmayacak');
  } else {
    saatler.forEach((k, i) => {
      const bicim = /^\d{1,2}:\d{2}$/;
      if (!dolu(k && k.gunler)) hatalar.push(`saatler[${i}].gunler boş`);
      if (!bicim.test(String(k && k.acilis))) hatalar.push(`saatler[${i}].acilis biçimi bozuk: "${k && k.acilis}"`);
      if (!bicim.test(String(k && k.kapanis))) hatalar.push(`saatler[${i}].kapanis biçimi bozuk: "${k && k.kapanis}"`);
    });
  }

  return { hatalar, uyarilar };
}

/* =====================================================================
   index.html'deki yedek metinler ile dukkan.json senkron mu?

   Başlıktaki .acilis ve altbilgideki .ayak-marka, JS gelmeden ya da
   dukkan.json okunamazsa görünen metinler; dolduruldu:false iken de
   kasıtlı olarak bunlara düşülüyor. Yani iki kaynak var ve elle
   eşlenmeleri gerekiyor. Uyuşmazlığı burada yakalıyoruz — yoksa dükkân
   taşındığında sayfa bir yerde yeni, bir yerde eski adresi gösterir.
   ===================================================================== */

export function yedekMetinDenetle(html, dukkan) {
  const hatalar = [];
  if (!dukkan || dukkan.dolduruldu !== true) return hatalar;   // bayrak kapalıysa konu dışı

  const dolu = (v) => typeof v === 'string' && v.trim() !== '';
  const a = dukkan.adres || {};
  const adres = dolu(a.satir) ? a.satir.trim() : null;

  const gecerli = (Array.isArray(dukkan.saatler) ? dukkan.saatler : [])
    .filter((k) => /^\d{1,2}:\d{2}$/.test(String(k && k.acilis))
                && /^\d{1,2}:\d{2}$/.test(String(k && k.kapanis)));
  // js/dukkan.js ile AYNI kural: tek kural varsa yazıyla, çoklu ise genel ifade
  const saat = gecerli.length === 1
    ? `${gecerli[0].gunler} ${gecerli[0].acilis} – ${gecerli[0].kapanis}`
    : gecerli.length > 1 ? 'Çalışma saatleri aşağıda' : null;

  const govde = (sec, ad) => {
    const m = new RegExp(sec, 's').exec(html);
    if (!m) { hatalar.push(`index.html: ${ad} bulunamadı (seçici değişmiş olabilir)`); return null; }
    return m[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  };

  const ust = govde('<p class="acilis">(.*?)</p>', 'başlıktaki .acilis');
  const alt = govde('<div class="ayak-marka">(.*?)</div>', 'altbilgideki .ayak-marka');

  const bekle = (metin, parca, nerede) => {
    if (metin === null || parca === null) return;
    if (!metin.includes(parca)) {
      hatalar.push(`index.html ${nerede} dukkan.json ile uyuşmuyor.\n` +
                   `      olması gereken : "${parca}"\n` +
                   `      sayfada yazan  : "${metin}"`);
    }
  };

  bekle(ust, saat, 'başlığında (.acilis) saat');
  bekle(ust, adres, 'başlığında (.acilis) adres');
  bekle(alt, adres, 'altbilgisinde (.ayak-marka) adres');
  bekle(alt, saat, 'altbilgisinde (.ayak-marka) saat');
  if (alt !== null && dolu(dukkan.ad) && !alt.includes(dukkan.ad.trim())) {
    hatalar.push(`index.html altbilgisinde dükkân adı uyuşmuyor.\n` +
                 `      olması gereken : "${dukkan.ad.trim()}"\n` +
                 `      sayfada yazan  : "${alt}"`);
  }
  return hatalar;
}

/* =====================================================================
   Betik olarak çalıştırıldığında
   ===================================================================== */

const dogrudanCalisiyor = process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (dogrudanCalisiyor) {
  const apiArg = process.argv.find((a) => a === '--api' || a.startsWith('--api='));

  let veri;
  let kaynakAdi;

  if (apiArg) {
    const adres = apiArg.includes('=')
      ? apiArg.split('=').slice(1).join('=')
      : 'http://localhost:3000/api/katalog';
    kaynakAdi = adres;
    try {
      const yanit = await fetch(adres);
      if (!yanit.ok) throw new Error(`sunucu ${yanit.status} döndü`);
      veri = await yanit.json();
    } catch (e) {
      console.error(`✗ ${adres} okunamadı: ${e.message}`);
      process.exit(1);
    }
  } else {
    kaynakAdi = 'data/products.json';
    try {
      veri = JSON.parse(readFileSync(join(KOK, 'data/products.json'), 'utf8'));
    } catch (e) {
      console.error('✗ data/products.json okunamadı ya da geçerli JSON değil:', e.message);
      process.exit(1);
    }
  }

  const { hatalar, uyarilar, ozet } = kataloguDenetle(veri);

  // Dosya kontrolleri yalnızca yerel dosyayı denetlerken anlamlı
  if (!apiArg && ozet) hatalar.push(...dosyalarariDenetle(veri));

  // Dükkân bilgileri ayrı bir dosya; katalog API'den okunsa bile denetlenir
  let dukkanKaynak = 'data/dukkan.json';
  try {
    const d = JSON.parse(readFileSync(join(KOK, 'data/dukkan.json'), 'utf8'));
    const s = dukkanDenetle(d);
    hatalar.push(...s.hatalar.map((h) => `dukkan.json: ${h}`));
    uyarilar.push(...s.uyarilar.map((u) => `dukkan.json: ${u}`));

    // index.html'deki yedek metinler bu dosyayla eşleşmeli
    try {
      const html = readFileSync(join(KOK, 'index.html'), 'utf8');
      hatalar.push(...yedekMetinDenetle(html, d));
    } catch (e) {
      uyarilar.push(`index.html okunamadı (${e.message}) — yedek metin denetimi atlandı`);
    }
  } catch (e) {
    uyarilar.push(`dukkan.json okunamadı (${e.message}) — dükkân bölümü çıkmayacak`);
    dukkanKaynak = null;
  }

  console.log('Meydan Şarküteri — veri kontrolü');
  console.log(`kaynak: ${kaynakAdi}`);
  console.log('─'.repeat(52));

  if (ozet) {
    const b = ozet.birim;
    const olculu = ozet.urun - (b.yok || 0);
    console.log(`ürün         ${ozet.urun}`);
    console.log(`reyon        ${ozet.reyon}`);
    console.log(`kaynak       ${Object.entries(ozet.kaynak).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
    console.log(`indirimli    ${ozet.indirimli}`);
    console.log(`stokta yok   ${ozet.stoktaYok}`);
    console.log(`miktar/birim ${olculu} dolu · ${b.yok || 0} boş  ` +
                `(kg ${b.kg || 0} · L ${b.L || 0} · adet ${b.adet || 0})`);
    console.log(`güncellendi  ${ozet.guncellendi}`);
  }
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
}
