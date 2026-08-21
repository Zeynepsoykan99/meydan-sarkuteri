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

## Vercel dağıtımı — ölçülmüş davranışlar

Proje: **meydan-sarkuteri-next**, Root Directory `nextjs`, Production
Branch `nextjs`. Depo kökündeki vanilla site ayrı bir projede
(`meydan-sarkuteri`, Production Branch `main`) kalmaya devam ediyor.

### DATABASE_URL "Sensitive" işaretliyken dağıtıma ULAŞMIYOR

**Ölçüm: 21 Ağustos 2026.** Değişken `Sensitive` olarak tanımlıyken üç
ardışık derlemede de `db-isit` şunu bastı:

    db-isit: DATABASE_URL yok, ısıtma atlandı

Çalışma zamanında da yoktu: `/api/saglik` `"bagli": false` ve
`"durum": "kısmi (yedekten besleniyor)"` dönüyordu. Site ayakta kalıyordu
ama tamamen `src/katalog-anlik.json`'dan besleniyordu — panel ve yönetici
uçları çalışmazdı.

Elenenler:
- **Betik değil.** `db-isit.mjs` `loadEnvConfig` + `process.env` kullanıyor.
  `loadEnvConfig`'in var olan bir ortam değişkenini ezip ezmediği iki
  senaryoda ölçüldü (.env dosyası olan ve olmayan dizin): ikisinde de
  değişmedi.
- **Tanım eksikliği değil.** `vercel env ls` değişkeni Production+Preview
  kapsamında ve bütün dağıtımlardan önce oluşturulmuş gösteriyordu.

Değişken **Sensitive olmadan** yeniden oluşturulunca aynı derleme:

    db-isit: veritabanı hazır (932 ms, 1. deneme)
    db-isit: src/katalog-anlik.json yazıldı (470 ürün)

ve `/api/saglik` `"bagli": true`, gecikme ~330-390 ms.

Not: Vercel dokümanı (`vercel.com/docs/cli/env`) Sensitive değerlerin
"remain available to builds and at runtime" olduğunu söylüyor. Ölçtüğümüz
davranış bununla çelişiyor. **DATABASE_URL'i Sensitive yapma.**

### Derleme süreleri (Vercel, 2 çekirdek / 1 worker)

| Ölçüm | Sayfa üretimi |
| --- | --- |
| Vercel | 13,3 – 18,4 sn |
| Yerel (16 çekirdek, 15 worker) | 3,6 – 4,6 sn |

Fark makineden; 40 sn'ye yaklaşan koşu görülmedi. Derleme veritabanına
hiç gitmiyor (`NEXT_PHASE === "phase-production-build"` iken anlık
görüntüden okunuyor), bu yüzden DB durumu derleme süresini etkilemiyor.

### Koruma kapsamı — üretim takma adı AÇIK

Hobby planında "All Deployments" koruması yok; Standard Protection
geçerli. Ölçüm:

    https://meydan-sarkuteri-next.vercel.app/        → 200  (korumasız)
    https://meydan-sarkuteri-next-<hash>-....app/    → 302  (Vercel SSO)

Yani dağıtım URL'leri korunuyor, **üretim takma adı korunmuyor**. Katalog
o adreste herkese açık. Denetim betiği bu yüzden bypass ile çalıştırılıyor:

    ADRES=https://... BYPASS=<secret> node tests/deploy-denetim.mjs
