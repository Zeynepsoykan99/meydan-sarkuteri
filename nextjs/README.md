# Meydan Şarküteri — Next.js sürümü (Aşama 1 & 2)

Kök dizindeki vanilla site **canlıda kalmaya devam ediyor**; bu klasör onun
kademeli Next.js geçişi. Aynı depo, aynı Neon veritabanı, aynı şema.

## Neden

Kök sitede 470 kart istemcide çiziliyor: ham HTML'de tek ürün yok, arama
motoru boş sayfa görüyor, ürün detayı `?urun=u001` sorgu parametresi olduğu
için indekslenmiyor. Bu sürümde katalog **sunucuda** render ediliyor ve her
ürünün `/urun/u001` gibi gerçek bir adresi, kendi başlığı ve açıklaması var.

## Çalıştırma

`DATABASE_URL` gerekiyor; Next yalnızca kendi kök dizinindeki .env
dosyalarını okuduğu için kökten kopyalanmalı:

```
grep ^DATABASE_URL ../.env.local > .env.local
npm install
npm run dev            # :3000
npm run build && npm start
```

`data/dukkan.json` depo kökünde duruyor ve buradan `../data/dukkan.json`
olarak okunuyor — iki sürüm aynı dosyayı paylaşıyor.

## Yapı

```
src/app/
  (vitrin)/          ana sayfa, /urun/[id], vitrin layout
  afis/              kapı afişi (A4 dikey, QR kodlu)
  giris/             giriş sayfası
  panel/             yönetici paneli
  api/
    giris/           POST  — oturum açma
    cikis/           POST  — oturum kapatma
    oturum/          GET   — oturum durumu
    sifre-degistir/  POST  — şifre değiştirme
    yonetici/
      durum/         GET   — dükkân durumu
      urunler/       GET   — tüm ürünler + reyonlar
      urun/          PATCH — ürün güncelleme
  globals.css        Tailwind teması (@theme) + bileşen sınıfları
  layout.tsx         kök layout (fontlar, metadata)

src/bilesenler/
  panel/             PanelArayuzu, UrunDuzenleModal, FiyatOnayModal
  (vitrin)           Baslik, KatalogBolumu, UrunKarti, DukkanBolum, AcikDurum...

src/lib/
  tipler.ts          tip tanımları (Urun, Reyon, Katalog, Dukkan, Durum)
  veritabani.ts      Neon Postgres bağlantısı
  katalog.ts         ürün ve reyon sorguları
  saat.ts            açık/kapalı mantığı (next bağımlılığı taşımaz)
  dukkan.ts          data/dukkan.json okuma
  bicim.ts           para formatlama, sadelestir, etiketParcalari
  auth.ts            scrypt hashle/doğrula, oturum, hız sınırı, bakım
  yonetici.ts        yama doğrulama, fiyat uyarıları

tests/
  dukkan.mjs         Aşama 1 sınamaları (47 test)
  asama2.mjs         Aşama 2 sınamaları (14 test)
```

## Kararlar

- **Tailwind v4**, CSS-first `@theme`. `tailwind.config.js` yok. Varsayılan
  palet `--color-*: initial` ile kapalı; `bg-blue-500` hiçbir şey üretmez.
- **Cache Components** (`cacheComponents: true`) + `use cache` +
  `cacheLife("minutes")` → revalidate 1 dk. Elle `Cache-Control` yazılmıyor.
- **`next/image` kullanılmıyor**: 470 ürün görseli zaten uzak CDN'de 400×400.
  İyileştirici dönüştürme kotası harcar, kazanç düşük.
- Açık/kapalı göstergesi `connection()` + `<Suspense>` ile akıyor: prerender
  sırasında `new Date()` okunamıyor, okunsa statik HTML'e donmuş saat gömülürdü.
- **Kimlik doğrulama**: scrypt (N=16384, r=8, p=1), HttpOnly + Secure çerez,
  15 dk pencerede 5 deneme hız sınırı. Sahte hash ile zamanlama saldırısı önlenir.
- **Çerez `secure` koşullu**: `NODE_ENV === "production"` → yerelde `http://`
  üzerinden geliştirme yapılabilsin. Risk belgelenmiş (bkz. `api/giris/route.ts`).
- **Panel mobil öncelikli**: esnafın telefonundan fiyat onayı ve düzenleme.
  10 kat sıçrama kontrolü, geri alma, uyarı sistemi.

## Bilinen kusur

`generateStaticParams` listesinde olmayan bir ürün id'si üretim derlemesinde
404 yerine **500** veriyor. Belgelenen çözüm `dynamicParams = false`,
Cache Components ile uyumsuz. `next dev`'de 404 doğru dönüyor. 470 gerçek
ürün adresi etkilenmiyor.

## Derleme Özeti

484 sayfa (470 ürün + ana + /afis + /giris + /panel + 404 + kabuk), PPR,
revalidate 1m / expire 1h. Derleme süresi: ~6 saniye.

## Sınama

```
npm i --no-save playwright-core     # projeye bağımlılık eklemez
npm start                            # başka bir terminalde (port 3001)

# Aşama 1 testleri
node --experimental-strip-types tests/dukkan.mjs

# Aşama 2 testleri (giriş, panel, afiş, API güvenliği)
node --experimental-strip-types tests/asama2.mjs
```

Toplam: **61 test** (47 + 14), %100 geçer.
