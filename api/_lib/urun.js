/* =====================================================================
   Ürün yükü ve doğrulama — katalog ucu ile panel ucu arasında ortak.

   Alan adlarının iki uçta ayrışmaması için eşleme TEK YERDE. Arayüz
   /api/katalog ile /api/yonetici/urunler arasında fark görmemeli.

   Buradaki doğrulama, db/schema.sql'deki CHECK kısıtlarının ve
   scripts/veri-kontrol.js'in aynı kurallarının üçüncü kopyası değil:
   veritabanı son savunma, veri-kontrol toplu denetim, bu ise istekten
   gelen veriyi kabul etmeden önceki kapı. Üçü de aynı kuralı
   uyguluyor; hangisi kaçırırsa diğeri yakalıyor.
   ===================================================================== */

export const GECERLI_BIRIMLER = ['kg', 'L', 'adet'];

/** Düzenlenebilir alanlar. Bunun dışındaki her şey reddedilir:
    ad, reyon, gorsel, id, kaynak panelden değiştirilemez. */
export const DUZENLENEBILIR = ['fiyat', 'eskiFiyat', 'miktar', 'birim', 'stokta'];

/** Veritabanı satırı → API yükü. Alan sırası /api/katalog ile aynı. */
export function urunYuku(u, damgaEkle = false) {
  const sayi = (v) => (v === null || v === undefined ? null : Number(v));
  const yuk = {
    id: u.id,
    ad: u.ad,
    reyon: u.reyon,
    gorsel: u.gorsel,
    fiyat: sayi(u.fiyat),
    eskiFiyat: sayi(u.eski_fiyat),
    kaynak: u.kaynak,
    miktar: sayi(u.miktar),
    birim: u.birim,
    stokta: u.stokta,
  };
  if (damgaEkle) yuk.guncellendi = u.guncellendi;
  return yuk;
}

const ONDALIK_EN_FAZLA = 2;

function ondalikSayisi(n) {
  const s = String(n);
  if (!s.includes('.')) return 0;
  return s.split('.')[1].length;
}

/* ---------------------------------------------------------------------
   Kısmi güncellemeyi doğrula.

   mevcut : veritabanındaki hâli (birleştirilmiş duruma bakabilmek için)
   yama   : istekten gelen alanlar

   Kısmi güncellemede tek başına alanlara bakmak yetmiyor: ürünün
   miktar'ı dolu iken yalnızca birim=null gönderilirse ortaya yarım
   kayıt çıkar. Bu yüzden doğrulama BİRLEŞTİRİLMİŞ sonuç üzerinde
   yapılıyor.

   Bütün hatalar toplanıp birlikte döndürülüyor; ilkinde durmuyoruz ki
   kullanıcı hepsini tek seferde görsün.
   --------------------------------------------------------------------- */
export function yamaDogrula(mevcut, yama) {
  const hatalar = [];

  // --- tanınmayan alanlar: sessizce yok saymıyoruz
  const bilinmeyen = Object.keys(yama).filter((k) => k !== 'id' && !DUZENLENEBILIR.includes(k));
  for (const k of bilinmeyen) {
    hatalar.push(`"${k}" alanı düzenlenemez. Düzenlenebilir alanlar: ${DUZENLENEBILIR.join(', ')}`);
  }

  const verildi = (k) => Object.prototype.hasOwnProperty.call(yama, k);

  /* --- fiyat --- */
  let yeniFiyat = Number(mevcut.fiyat);
  if (verildi('fiyat')) {
    const f = yama.fiyat;
    if (typeof f !== 'number' || !isFinite(f)) {
      hatalar.push('fiyat sayı olmalı');
    } else if (!(f > 0)) {
      hatalar.push('fiyat sıfırdan büyük olmalı');
    } else if (ondalikSayisi(f) > ONDALIK_EN_FAZLA) {
      hatalar.push(`fiyat en fazla ${ONDALIK_EN_FAZLA} ondalık basamak içerebilir (kuruş)`);
    } else {
      yeniFiyat = f;
    }
  }

  /* --- eskiFiyat: yeni fiyata göre kontrol ediliyor --- */
  let yeniEski = mevcut.eski_fiyat === null ? null : Number(mevcut.eski_fiyat);
  if (verildi('eskiFiyat')) {
    const e = yama.eskiFiyat;
    if (e === null) {
      yeniEski = null;
    } else if (typeof e !== 'number' || !isFinite(e)) {
      hatalar.push('eskiFiyat sayı ya da null olmalı');
    } else if (!(e > 0)) {
      hatalar.push('eskiFiyat sıfırdan büyük olmalı');
    } else if (ondalikSayisi(e) > ONDALIK_EN_FAZLA) {
      hatalar.push(`eskiFiyat en fazla ${ONDALIK_EN_FAZLA} ondalık basamak içerebilir (kuruş)`);
    } else {
      yeniEski = e;
    }
  }
  if (yeniEski !== null && !(yeniEski > yeniFiyat)) {
    hatalar.push(
      `eskiFiyat (${yeniEski}) güncel fiyattan (${yeniFiyat}) büyük olmalı — ` +
      'indirim, fiyatın düşmüş olması demek');
  }

  /* --- miktar / birim: birleştirilmiş sonuç üzerinden --- */
  let yeniMiktar = verildi('miktar') ? yama.miktar
                 : (mevcut.miktar === null ? null : Number(mevcut.miktar));
  let yeniBirim = verildi('birim') ? yama.birim : mevcut.birim;

  if (verildi('miktar') && yeniMiktar !== null) {
    if (typeof yeniMiktar !== 'number' || !isFinite(yeniMiktar)) {
      hatalar.push('miktar sayı ya da null olmalı');
      yeniMiktar = null;
    } else if (!(yeniMiktar > 0)) {
      hatalar.push('miktar sıfırdan büyük olmalı');
    }
  }
  if (verildi('birim') && yeniBirim !== null) {
    if (typeof yeniBirim !== 'string' || !GECERLI_BIRIMLER.includes(yeniBirim)) {
      hatalar.push(`birim yalnızca ${GECERLI_BIRIMLER.join(', ')} olabilir (gelen: ${JSON.stringify(yama.birim)})`);
      yeniBirim = null;
    }
  }
  if ((yeniMiktar === null) !== (yeniBirim === null)) {
    hatalar.push(
      'miktar ve birim birlikte dolu ya da birlikte boş olmalı ' +
      `(sonuç: miktar=${JSON.stringify(yeniMiktar)}, birim=${JSON.stringify(yeniBirim)})`);
  }
  if (yeniBirim === 'adet' && typeof yeniMiktar === 'number' && !Number.isInteger(yeniMiktar)) {
    hatalar.push(`birim "adet" olduğunda miktar tam sayı olmalı (gelen: ${yeniMiktar})`);
  }

  /* --- stokta: kesin boolean --- */
  if (verildi('stokta') && typeof yama.stokta !== 'boolean') {
    hatalar.push(`stokta true ya da false olmalı (gelen: ${JSON.stringify(yama.stokta)})`);
  }

  return { hatalar, yeniFiyat, yeniEski, yeniMiktar, yeniBirim };
}

/* ---------------------------------------------------------------------
   Fiyat aykırılığı — HATA DEĞİL, uyarı.

   Amaç 3,95 yerine 395 yazılmasını yakalamak. Kaydı reddetmiyoruz:
   gerçekten 100 kat pahalı bir ürün girilmiş olabilir ve sahibini
   kendi verisinden kilitlemek doğru değil. Yalnızca söylüyoruz.
   --------------------------------------------------------------------- */
export function fiyatUyarilari(eskiFiyat, yeniFiyat, reyonMedyan) {
  const uyarilar = [];
  const onceki = Number(eskiFiyat);

  if (onceki > 0 && yeniFiyat > 0) {
    const kat = yeniFiyat / onceki;
    if (kat >= 10) {
      uyarilar.push(
        `Fiyat ${Math.round(kat)} kat arttı (₺${onceki} → ₺${yeniFiyat}). ` +
        'Ondalık ayracını atlamış olabilirsiniz.');
    } else if (kat <= 0.1) {
      uyarilar.push(
        `Fiyat ${Math.round(1 / kat)} kat azaldı (₺${onceki} → ₺${yeniFiyat}). ` +
        'Fazladan sıfır silmiş olabilirsiniz.');
    }
  }

  if (reyonMedyan > 0 && yeniFiyat > reyonMedyan * 12) {
    uyarilar.push(
      `Fiyat, reyon medyanının (₺${reyonMedyan}) ${Math.round(yeniFiyat / reyonMedyan)} katı.`);
  }

  return uyarilar;
}
