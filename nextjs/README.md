# Meydan Şarküteri — Next.js sürümü (Aşama 1)

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
src/app/            layout, ana sayfa, /urun/[id], 404
src/bilesenler/     Baslik, KatalogBolumu (istemci adası), UrunKarti, Dukkan*
src/lib/            tipler, veritabani, katalog, saat (saf), dukkan, bicim
src/app/globals.css Tailwind teması (@theme) + bileşen sınıfları
tests/dukkan.mjs    kökteki tests/dukkan.mjs'in bu sürüme uyarlanmışı
```

`src/lib/saat.ts` bilerek `next/*` bağımlılığı taşımıyor: açık/kapalı
mantığı çıplak Node'dan (sınamalardan) doğrudan import edilebilsin diye.

## Kararlar

- **Tailwind v4**, CSS-first `@theme`. `tailwind.config.js` yok. Varsayılan
  palet `--color-*: initial` ile kapalı; `bg-blue-500` hiçbir şey üretmez.
- **Cache Components** (`cacheComponents: true`) + `use cache` +
  `cacheLife("minutes")` → revalidate 1 dk. Elle `Cache-Control` yazılmıyor.
- **`next/image` kullanılmıyor**: 470 ürün görseli zaten uzak CDN'de 400×400.
  İyileştirici dönüştürme kotası harcar, kazanç düşük.
- Açık/kapalı göstergesi `connection()` + `<Suspense>` ile akıyor: prerender
  sırasında `new Date()` okunamıyor, okunsa statik HTML'e donmuş saat gömülürdü.

## Bilinen kusur

`generateStaticParams` listesinde olmayan bir ürün id'si üretim derlemesinde
404 yerine **500** veriyor. Belgelenen çözüm `dynamicParams = false`,
Cache Components ile uyumsuz. `next dev`'de 404 doğru dönüyor. 470 gerçek
ürün adresi etkilenmiyor. Aşama 2'de ele alınacak.

## Sınama

```
npm i --no-save playwright-core     # projeye bağımlılık eklemez
npm start                            # başka bir terminalde
node --experimental-strip-types tests/dukkan.mjs
```
