import type { MetadataRoute } from "next";
import { siteRolu, siteTabani } from "@/lib/ortam";

/* robots.txt — Next.js metadata API'si ile üretiliyor.

   İKİ AYRI DAVRANIŞ:
   - canlı  : bugünkü kurallar. Katalog indekslenir, panel/giriş/afiş ve
              API uçları kapalı.
   - preview: HER ŞEY kapalı ve sitemap HİÇ verilmiyor. Preview projesinin
              üretim takma adı Hobby planında korunmuyor (ölçüldü), yani
              kataloğun ikinci bir kopyası internete açık. Arama motoruna
              bildirilmezse yinelenen içerik sorunu doğmaz.

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
