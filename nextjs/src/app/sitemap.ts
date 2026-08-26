import type { MetadataRoute } from "next";
import { katalogGetir } from "@/lib/katalog";
import { siteTabani } from "@/lib/ortam";

/* Site haritası — 470 ürün sayfası dahil.
   Kökteki statik sitemap.xml yalnızca ana sayfayı içeriyordu; ürün
   adresleri arama motoruna hiç bildirilmiyordu.

   /panel, /giris ve /afis BİLEREK YOK: üçü de robots.txt'te Disallow ve
   metadata'da noindex. Haritaya koymak, "indeksleme" ile "girme" arasında
   çelişkili sinyal vermek olurdu.

   lastModified ürünlerin guncellendi damgasından geliyor; veritabanı
   okunamazsa katalogGetir zaten yedeğe düşüyor, harita yine üretiliyor. */
/* Taban artık SABİT DEĞİL. Önceden "https://meydan-sarkuteri.vercel.app"
   yazılıydı ve canlı olmayan her kopyada bu yanlıştı: o kopyanın sitemap'i
   canlı sitenin adreslerini bildiriyordu. Bugün tek proje var ve sabit
   değer yine doğru sonucu verirdi — ama dal preview'ları ve ileride
   açılabilecek ikinci bir ortam için taban yine türetiliyor. Öncelik
   sırası ve gerekçe lib/ortam.ts'te. */

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const TABAN = siteTabani();
  const { urunler, guncellendi } = await katalogGetir();
  const damga = guncellendi ? new Date(guncellendi) : new Date();

  return [
    {
      url: TABAN,
      lastModified: damga,
      changeFrequency: "daily",
      priority: 1,
    },
    ...urunler.map((u) => ({
      url: `${TABAN}/urun/${u.id}`,
      lastModified: damga,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
