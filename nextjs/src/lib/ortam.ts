/* =====================================================================
   Ortam rolü ve site tabanı — robots.ts ve sitemap.ts buradan besleniyor.

   NEDEN GEREKLİ:
   Aynı depo iki Vercel projesine dağıtılıyor. Preview projesinin üretim
   takma adı (meydan-sarkuteri-next.vercel.app) Hobby planında KORUNMUYOR
   — ölçüldü, bypass'sız 200 dönüyor. Yani kataloğun ikinci bir kopyası
   internete açık ve arama motoru onu canlı siteyle yinelenen içerik
   olarak indeksleyebilir.

   NEDEN VERCEL_ENV YETMİYOR:
   Preview projesinde de VERCEL_ENV === "production", çünkü onun Production
   Branch'i `nextjs`. İki projeyi ayırt etmiyor. Bu yüzden açık, okunur ve
   kazayla ters çalışmayan bir değişken kullanıyoruz: SITE_ROLU.
   ===================================================================== */

export type SiteRolu = "canli" | "preview";

/* VARSAYILAN "preview" — yani değişken tanımsızsa site KAPALI sayılıyor.

   Bu bilinçli bir fail-safe. İki yanlış senaryo var ve simetrik değiller:

   - Canlı projede değişken unutulursa: site indekslenmez. Gürültülü ve
     hızlı fark edilen bir hata — Search Console'da hemen görünür,
     tek değişkenle geri alınır.
   - Preview projesinde değişken unutulursa: preview kopyası açık kalır,
     indekslenir, canlı siteyle yinelenen içerik üretir. SESSİZ bir hata;
     kimse bakmazsa aylarca sürer ve zararı geri almak (deindeksleme)
     çok daha yavaştır.

   Sessiz olanı engellemek, gürültülü olanı göze almaktan daha değerli.
   Bu yüzden "bilmiyorsam kapat" tarafını seçiyoruz. */
export function siteRolu(): SiteRolu {
  return process.env.SITE_ROLU === "canli" ? "canli" : "preview";
}

/* Site tabanı — sitemap ve robots'taki mutlak adresler için.
   Önceden sabit "https://meydan-sarkuteri.vercel.app" yazılıydı; preview
   projesinde bu YANLIŞTI: preview'ın sitemap'i canlı sitenin adreslerini
   bildiriyordu. Sıra: açık ayar → Vercel'in verdiği üretim adresi →
   son çare sabit. */
export function siteTabani(): string {
  const acik = process.env.SITE_TABANI;
  if (acik) return acik.replace(/\/$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;

  return "https://meydan-sarkuteri.vercel.app";
}
