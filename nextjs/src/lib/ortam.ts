/* =====================================================================
   Ortam rolü ve site tabanı — robots.ts ve sitemap.ts buradan besleniyor.

   NEDEN DOĞDU:
   Depo bir süre İKİ Vercel projesine dağıtılıyordu. İkincisinin üretim
   takma adı Hobby planında KORUNMUYORDU — ölçüldü, bypass'sız 200
   dönüyordu. Yani kataloğun ikinci bir kopyası internete açıktı ve arama
   motoru onu canlı siteyle yinelenen içerik olarak indeksleyebilirdi.

   O PROJE ARTIK YOK (26 Ağustos 2026'da silindi). Bugün tek proje var:
   meydan-sarkuteri, Production Branch `main`.

   PEKİ NEDEN DURUYOR:
   Bu bir fail-safe ve bedeli tek bir ortam değişkeni. İki gerekçesi var:

   1. SİLİNMESİ CANLIYI KIRAR. Kod kalkarsa robots.ts'in rol ayrımı da
      kalkar; SITE_ROLU tanımsız kaldığında varsayılan "preview" olduğu
      için canlı site `Disallow: /` sunmaya başlar — sessizce
      deindekslenir. Değişken canlıda `SITE_ROLU=canli` olarak tanımlı.
   2. İKİNCİ ORTAM YİNE AÇILABİLİR. Hazırlık/deneme projesi, ayrı bir
      müşteri kopyası ya da bir çatal — hepsi aynı tuzağı geri getirir.
      Mekanizma yerinde durursa yeni ortam varsayılan olarak KAPALI
      doğuyor; kaldırılırsa varsayılan olarak AÇIK doğar.

   NEDEN VERCEL_ENV YETMİYORDU:
   İkinci projede de VERCEL_ENV === "production" idi, çünkü onun Production
   Branch'i kendi dalıydı. İki projeyi ayırt etmiyordu. Bu yüzden açık,
   okunur ve kazayla ters çalışmayan bir değişken kullanıyoruz: SITE_ROLU.
   ===================================================================== */

export type SiteRolu = "canli" | "preview";

/* VARSAYILAN "preview" — yani değişken tanımsızsa site KAPALI sayılıyor.

   Bu bilinçli bir fail-safe. İki yanlış senaryo var ve simetrik değiller:

   - Canlı projede değişken unutulursa: site indekslenmez. Gürültülü ve
     hızlı fark edilen bir hata — Search Console'da hemen görünür,
     tek değişkenle geri alınır.
   - İkinci bir ortamda değişken unutulursa: o kopya açık kalır,
     indekslenir, canlı siteyle yinelenen içerik üretir. SESSİZ bir hata;
     kimse bakmazsa aylarca sürer ve zararı geri almak (deindeksleme)
     çok daha yavaştır.

   Sessiz olanı engellemek, gürültülü olanı göze almaktan daha değerli.
   Bu yüzden "bilmiyorsam kapat" tarafını seçiyoruz. */
export function siteRolu(): SiteRolu {
  return process.env.SITE_ROLU === "canli" ? "canli" : "preview";
}

/* Site tabanı — sitemap ve robots'taki mutlak adresler için.
   Önceden sabit "https://meydan-sarkuteri.vercel.app" yazılıydı; canlı
   olmayan her kopyada bu YANLIŞTI: o kopyanın sitemap'i canlı sitenin
   adreslerini bildiriyordu. Sıra: açık ayar → Vercel'in verdiği üretim
   adresi → son çare sabit. */
export function siteTabani(): string {
  const acik = process.env.SITE_TABANI;
  if (acik) return acik.replace(/\/$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;

  return "https://meydan-sarkuteri.vercel.app";
}
