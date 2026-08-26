import type { MetadataRoute } from "next";
import { siteRolu, siteTabani } from "@/lib/ortam";

/* robots.txt — Next.js metadata API'si ile üretiliyor.

   İKİ AYRI DAVRANIŞ:
   - canlı  : bugünkü kurallar. Katalog indekslenir, panel/giriş/afiş ve
              API uçları kapalı.
   - preview: HER ŞEY kapalı ve sitemap HİÇ verilmiyor. Canlı olmayan her
              kopya (dal preview'ı, ileride açılacak bir hazırlık projesi)
              arama motoruna bildirilmezse yinelenen içerik sorunu doğmaz.
              Bu ayrım bir zamanlar var olan ikinci proje için yazılmıştı;
              o proje silindi (26 Ağustos 2026) ama ayrım fail-safe olarak
              duruyor — gerekçesi lib/ortam.ts'te.

   Rol tanımsızsa "preview" sayılıyor — gerekçesi lib/ortam.ts'te. */
export default function robots(): MetadataRoute.Robots {
  if (siteRolu() !== "canli") {
    return {
      rules: { userAgent: "*", disallow: "/" },
      // sitemap BİLEREK YOK: kapalı bir kopyanın haritasını vermek çelişki
    };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/panel", "/giris", "/api/", "/afis"],
    },
    sitemap: `${siteTabani()}/sitemap.xml`,
  };
}
