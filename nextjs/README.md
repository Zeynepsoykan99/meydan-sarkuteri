# Meydan Şarküteri — Next.js Sürümü

Bu proje Next.js 16.2 App Router, Tailwind CSS v4 ve Neon Postgres tabanlıdır.
**Henüz yayında değil:** canlıdaki adres hâlâ eski vanilla siteyi sunuyor.
Yayına geçiş `nextjs` dalı `main`'e birleştirildiğinde olur (bkz. kökteki
README, "Yayın" bölümü).

## Neden Next.js

Eski sitede 470 kart istemcide çiziliyordu: ham HTML'de tek ürün yoktu, arama
motoru boş sayfa görüyordu, ürün detayı `?urun=u001` sorgu parametresi olduğu
için indekslenmiyordu. Bu sürümde katalog **sunucuda** render ediliyor ve her
ürünün `/urun/u001` gibi gerçek bir statik adresi, kendi başlığı ve açıklaması var.

## Çalıştırma

```bash
cd nextjs
npm install
npm run dev            # :3000
npm run build && npm start
```

`data/dukkan.json` depo kökünde duruyor; iki sürüm aynı dosyayı paylaşıyor.
`prebuild` (yani `scripts/db-isit.mjs`) dosyayı `nextjs/data/` altına kopyalar,
çünkü Vercel'de kök `nextjs/` olduğunda üst dizine erişim güvenilir değil.
`lib/dukkan.ts` önce kopyayı, sonra `../data/` yolunu dener.

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
    saglik/          GET   — sağlık/canlılık raporu (DB gecikmesi, yedek tazeliği)
    yonetici/
      durum/         GET   — dükkân durumu
      urunler/       GET   — tüm ürünler + reyonlar
      urun/          PATCH — ürün güncelleme
                     POST  — yeni ürün ekleme
                     DELETE— ürün silme
  globals.css        Tailwind teması (@theme) + bileşen sınıfları + animasyonlar
  layout.tsx         kök layout (fontlar, metadata, viewport)
  robots.ts          robots.txt (panel/giriş/api/afiş indekslenmez)
  global-error.tsx   kök hata sınırı
  (vitrin)/error.tsx, panel/error.tsx   bölüm hata sınırları

src/bilesenler/
  panel/             PanelArayuzu, UrunDuzenleModal, UrunEkleModal,
                     UrunSilModal, FiyatOnayModal
  (vitrin)           Baslik, KatalogBolumu, UrunKarti, DukkanBolum, AcikDurum...

src/lib/
  tipler.ts          tip tanımları (Urun, Reyon, Katalog, Dukkan, Durum)
  veritabani.ts      Neon Postgres bağlantısı
  katalog.ts         ürün ve reyon sorguları
  saat.ts            açık/kapalı mantığı (next bağımlılığı taşımaz)
  dukkan.ts          data/dukkan.json okuma
  bicim.ts           para formatlama, sadelestir, etiketParcalari
  auth.ts            scrypt hashle/doğrula, oturum, hız sınırı, bakım
  yonetici.ts        yama doğrulama, yeni ürün doğrulama, fiyat uyarıları

tests/
  dukkan.mjs                 Aşama 1 — saat, katalog, erişilebilirlik (47)
  asama2.mjs                 Aşama 2 — yetkisiz taraf, durum kodları (42)
  asama2-yetkili.mjs         Aşama 2 — gerçek oturumla yazma yolu (46)
  asama3-urun-yonetimi.mjs   Aşama 3 — ürün ekleme/silme (21)
  saglik.mjs                 sağlık ucu, PWA, yönlendirmeler, başlıklar (21)
  agirlik.mjs                sayfa ağırlığı ölçümü (sınama değil, rapor)
```

## Kararlar

- **Tailwind v4**, CSS-first `@theme`. `tailwind.config.js` yok. Varsayılan
  palet `--color-*: initial` ile kapalı; `bg-blue-500` hiçbir şey üretmez.
- **Cache Components** (`cacheComponents: true`) + `use cache` +
  `cacheLife("minutes")` → revalidate 1 dk. Elle `Cache-Control` yazılmıyor.
- **Derleme veritabanına dokunmuyor**: `NEXT_PHASE === "phase-production-build"`
  iken `katalogGetir()` prebuild'in ürettiği `katalog-anlik.json`'u okuyor.
  `use cache` doldurmasının sabit 50 sn bütçesi vardı ve Neon'un uyanması bu
  bütçenin içinde ödeniyordu; derleme rastgele çöküyordu. Artık sayfa üretimi
  ~5 sn ve veritabanı durumundan bağımsız. Çalışma zamanı değişmedi.
- **Hata sınırları**: kök (`global-error.tsx`), vitrin ve panel için ayrı
  `error.tsx`. Kök layout çöktüğünde stil de düşeceği için `global-error`
  temayı kendisi içe aktarıyor.
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

## Bilinen kusur (geçici çözümle kapatıldı)

`generateStaticParams` listesinde olmayan bir ürün id'si üretim derlemesinde
404 yerine **500** veriyordu. Belgelenen çözüm `dynamicParams = false`,
Cache Components ile uyumsuz. `src/proxy.ts` isteği sayfaya varmadan kesiyor
ve bilinmeyen kimliği Next'in normal 404 akışına yazıyor; kimlik listesini
(`src/urun-kimlikleri.json`) derleme öncesi `db-isit.mjs` üretiyor.
Bedeli ve kalıcı çözüm: `ILERLEME.md`.

## Derleme Özeti

484 sayfa (470 ürün + ana + /afis + /giris + /panel + 404 + kabuk), PPR,
revalidate 1m / expire 1h. Derleme süresi: ~6 saniye.

## Sınama

```
npm i --no-save playwright-core     # projeye bağımlılık eklemez
npm run build && npm start -- -p 3001

node --experimental-strip-types tests/dukkan.mjs
node --experimental-strip-types tests/asama2.mjs
node --experimental-strip-types tests/saglik.mjs
node --experimental-strip-types tests/asama2-yetkili.mjs      # CANLI DB'ye yazar
node --experimental-strip-types tests/asama3-urun-yonetimi.mjs # CANLI DB'ye yazar
```

Toplam: **177 sınama**, %100 geçiyor (20 Ağustos 2026).

Son iki dosya canlı veritabanına yazıyor. İkisi de yazdığını geri alıyor:
`asama2-yetkili` ürünlerin kopyasını alıp sonunda satır satır doğrulayarak
geri yüklüyor, `asama3` eklediği ürünü ve geçici hesabı `finally` içinde
siliyor. Ayrıntı: `ILERLEME.md`.

`npm run lint` **temiz değil**: 26 hata (19'u bu turdan önce de vardı).
Çoğu `any` kullanımı ve efekt içinde `setState`. Derlemeyi engellemiyor.
