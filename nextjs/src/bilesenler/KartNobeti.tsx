"use client";

import { useLinkStatus } from "next/link";

/* Tıklanan ürün kartında "açılıyor" işareti.

   NEDEN loading.tsx DEĞİL — ölçülmüş bir tercih:
   Ürüne geçiş yavaş ağda (200 kbps / 800 ms) 912 ms sürüyor ve o süre
   boyunca ekranda hiçbir geri bildirim yoktu: eski sayfa aynen duruyor,
   tıklanan kart hiç değişmiyor. Beyaz ekran yok — sorun belirsizlik.

   İki çözüm vardı:

   1. app/(vitrin)/urun/[id]/loading.tsx — bütün sayfayı iskeletle
      değiştirir. İki sakıncası var: (a) ürün sayfaları statik ön-render
      edilmiş (◐), hızlı bağlantıda ~100 ms'de geliyor; iskelet göz
      kırpar — istenen tam tersi. (b) ziyaretçinin kaydırarak geldiği
      katalog ekrandan silinir, hangi karta bastığı bilgisi kaybolur.

   2. useLinkStatus ile kart düzeyinde işaret — seçilen bu.

   Next dokümanı da bu ayrımı yapıyor (use-link-status.md): kanca
   "prefetching kapalıyken ya da sürerken" ve "hedef rota dinamikse ve
   loading.js yoksa" için öneriliyor; kartlarımızda prefetch BİLEREK
   kapalı (UrunKarti'ndaki gerekçeye bakın: 470 bağlantı önden getirilirse
   27 istek / 81 KB boşa gidiyordu). Aynı doküman "bağlantı önceden
   getirilmişse bekleme durumu atlanır" diyor.

   CANLIDA ÖLÇÜLDÜ (26 Ağustos 2026) — "HIZLIDA GÖRÜNMEZ" ÖLÇÜTÜ DÜŞTÜ:
   Yukarıdaki "sınırsız 32 ms / görünmedi" rakamı YEREL sunucuyla
   alınmıştı. Canlıda (meydan-sarkuteri.vercel.app, iad1) ölçüm
   MutationObserver ile yinelendi — nöbet HER hızda tıklamadan ~2 ms
   sonra açılıyor, çünkü RSC gidiş-dönüşü kısıtsız ağda bile 150 ms'lik
   soluklaşmadan uzun:

       sınırsız  ·  açıldı 2 ms  ·  kapandı 344 / 573 ms
       5 Mbps    ·  açıldı 1 ms  ·  kapandı 713 / 826 ms
       200 kbps  ·  açıldı 2 ms  ·  kapandı 911 / 918 ms

   KARAR: DOKUNULMADI. 342 ms zaten geri bildirim isteyen bir süre;
   titreşim riski 30-50 ms'lik beklemeler için geçerliydi ve gerçek ağda
   o aralık hiç oluşmuyor. Ölçüt yanlış kurulmuştu — yerel gecikmeyi
   canlının yerine koyuyordu; uygulama doğru.

   Dokümanın yerleşim kayması uyarısına uyuluyor: öğe HER ZAMAN çiziliyor,
   mutlak konumlu, yalnızca opaklığı değişiyor. Kartın yüksekliğine
   dokunmuyor.

   Hareket yok, yalnızca opaklık — prefers-reduced-motion'ı kendiliğinden
   karşılıyor. */
export default function KartNobeti() {
  const { pending } = useLinkStatus();

  return (
    <span
      aria-hidden="true"
      data-bekliyor={pending ? "" : undefined}
      className="pointer-events-none absolute inset-0 rounded-[inherit]
                 bg-murekkep/10 opacity-0 transition-opacity duration-150
                 outline outline-[3px] -outline-offset-[3px] outline-murekkep
                 data-[bekliyor]:opacity-100"
    />
  );
}
