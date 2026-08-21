import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import kimlikler from "./urun-kimlikleri.json";

/* =====================================================================
   GEÇİCİ ÇÖZÜM — olmayan ürün id'si 404 dönsün diye.

   SORUN (Next 16.2.12 + cacheComponents):
   /urun/[id] rotası generateStaticParams kullandığı için SSG sayılıyor.
   O rotada notFound() atıldığında Next önbellek girdisine revalidate: 0
   veriyor (404 önbelleklenmesin diye), ama aynı kod yolu revalidate < 1
   değerini kabul etmiyor:

     node_modules/next/dist/build/templates/app-page.js:1002
     throw new Error(`Invalid revalidate configuration provided: 0 < 1`)

   Sonuç: ziyaretçiye ve arama motoruna 404 yerine 500. Sunucu günlüğünde
   sırasıyla DYNAMIC_SERVER_USAGE → "0 < 1" → /500 sayfası bulunamadı.

   DENENENLER:
   - `export const dynamicParams = false` (belgelenen çözüm): Turbopack
     derlemeyi reddediyor — "Route segment config dynamicParams is not
     compatible with nextConfig.cacheComponents. Please remove it."
   - 16.2 içinde yama: 16.2.12 dalın sonuncusu, düzeltme yok.
     16.3'e geçmek proje kuralıyla yasak.

   BU ÇÖZÜM:
   İstek sayfaya ULAŞMADAN burada kesiliyor. Kimlik listede yoksa istek
   var olmayan bir adrese yeniden yazılıyor; Next'in normal 404 akışı
   devreye giriyor ve app/not-found.tsx doğru 404 durumuyla çiziliyor.
   SSG rotası hiç render edilmediği için revalidate hatası da doğmuyor.

   Liste derleme zamanında scripts/db-isit.mjs tarafından üretiliyor ve
   depoya giriyor — böylece veritabanı erişilemezken de derleme yapılabilir.

   BEDELİ (bilerek kabul edildi):
   1. Liste bir ANLIK GÖRÜNTÜ. Derlemeden SONRA eklenen bir ürün, bir
      sonraki derlemeye kadar 404 döner. Eskiden 500 dönüyordu, yani bu
      bir gerileme değil; ama "yeni ürün hemen yayında" beklentisi varsa
      derleme tetiklenmeli.
   2. Derlemeden SONRA SİLİNEN bir ürün listede kalmaya devam eder;
      o adres sayfaya ulaşır ve 500 kusuru geri gelir. Ürün silmek çok
      seyrek (şemaya göre bugüne dek u139 ve u258); silindiğinde yeniden
      derlemek gerekir.
   3. Her /urun/* isteği bir Set aramasından geçiyor — 470 elemanlı,
      ölçülebilir bir maliyeti yok.

   Next'te kusur düzeldiğinde: bu dosya ve db-isit.mjs'teki liste yazma
   adımı silinip page.tsx'teki notFound() yalnız bırakılabilir.
   ===================================================================== */

const GECERLI = new Set(kimlikler as string[]);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // matcher zaten daraltıyor; yine de biçim kontrolü yapıp emin oluyoruz
  const esles = /^\/urun\/([^/]+)\/?$/.exec(pathname);
  if (!esles) return NextResponse.next();

  const id = decodeURIComponent(esles[1]);
  if (GECERLI.has(id)) return NextResponse.next();

  /* Var olmayan bir adrese yeniden yaz: Next kendi 404'ünü üretir.
     Yol adı bilerek "çakışamaz" biçimde — app/ altında böyle bir rota
     yok ve olması da beklenmiyor. */
  return NextResponse.rewrite(new URL("/_urun-bulunamadi", request.url));
}

export const config = {
  matcher: "/urun/:id*",
};
