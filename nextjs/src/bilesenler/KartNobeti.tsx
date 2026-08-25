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
   getirilmişse bekleme durumu atlanır" diyor — yani hızlı yolda
   titreşim üretmiyor, ölçütün ikinci yarısı da sağlanıyor.

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
