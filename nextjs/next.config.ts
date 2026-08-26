import type { NextConfig } from "next";

import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  /* Depoda iki lockfile var (kök vanilla site + bu uygulama); kök
     otomatik bulunmaya bırakılırsa yanlış tahmin ediliyor. Açıkça
     belirtiliyor.

     NEDEN turbopack.root DEĞİL outputFileTracingRoot:
     Next 16 ikisini TEK bir köke indirgiyor (server/config.js):

         let rootDir = outputFileTracingRoot || turbopack.root;
         if (!rootDir) { ...lockfile tahmini... }

     İkisi de ayarlıysa ve DEĞERLERİ FARKLIYSA uyarı basıp
     outputFileTracingRoot'u kullanıyor. Vercel kendi modifyConfig'inde
     outputFileTracingRoot'u depo köküne (/vercel/path0) ayarlıyor; biz
     turbopack.root'a nextjs dizinini yazdığımız için her üretim
     derlemesi bu uyarıyı iki kez basıyordu — ve bizim değerimiz zaten
     yok sayılıyordu.

     Yetkili anahtarı yazınca çelişki yapısal olarak ortadan kalkıyor:
     tek anahtar kaldığı için karşılaştırılacak ikinci değer yok.
     Lockfile tahmini de devre dışı kalmaya devam ediyor, çünkü rootDir
     yine doluyor.

     DEĞER NEDEN ".." (DEPO KÖKÜ), "." (nextjs/) DEĞİL:
     Vercel kendi modifyConfig'inde bu anahtarı depo köküne
     (/vercel/path0) yazıyor — Root Directory `nextjs` olsa bile. Biz
     nextjs dizinini yazarsak yerelde ve Vercel'de İKİ FARKLI kök
     kullanılır; izleme yerelde dar, üretimde geniş olur ve fark ancak
     bir dosya paketten düştüğünde anlaşılır. Depo kökünü yazınca iki
     ortam aynı kökte buluşuyor. İki lockfile'lı depoda tahmin yine
     devrede değil, çünkü değer açıkça verilmiş. */
  outputFileTracingRoot: fileURLToPath(new URL("..", import.meta.url)),
  /* Cache Components: Next 16'nın önbellek modeli. Elle Cache-Control
     yazmıyoruz; önbelleklenecek şeyi 'use cache' + cacheLife belirliyor.
     PPR'yi de varsayılan yapıyor: statik kabuk hemen, dinamik parça akarak. */
  cacheComponents: true,

  /* Güvenlik başlıkları. Hiç yoktu — denetimde çıktı.
   *
   * CSP'de script-src 'unsafe-inline' NEDEN var: Next hidrasyon için
   * satır içi <script> üretiyor. Bunu kaldırmanın belgelenen tek yolu
   * nonce, nonce ise "must use dynamic rendering" gerektiriyor
   * (docs/01-app/02-guides/content-security-policy.md:38). Dinamik render
   * 470 statik ürün sayfasını ve PPR'ı iptal ederdi — bu turun kapsamı
   * dışında. Bu yüzden script/style gevşek bırakıldı; asıl korumayı
   * frame-ancestors, base-uri, object-src ve form-action veriyor:
   * tıklama hırsızlığı, taban adres kaçırma, eklenti ve form kaçırma
   * kapalı. Sıkılaştırma istenirse nonce + dinamik render ayrı bir iş.
   *
   * img-src'de https: geniş: görseller A101 ve Migros CDN'lerinden
   * geliyor, ikisi de sabit bir alan adı listesine sığmıyor. */
  headers() {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "object-src 'none'",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
        ],
      },
    ];
  },

  async redirects() {
    return [
      { source: "/index.html", destination: "/", permanent: true },
      { source: "/giris.html", destination: "/giris", permanent: true },
      { source: "/panel.html", destination: "/panel", permanent: true },
      { source: "/afis.html", destination: "/afis", permanent: true },
    ];
  },
};

export default nextConfig;
