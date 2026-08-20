"use client";

import { useEffect } from "react";

/* Yüklenemeyen ürün görselleri için yer tutucu — kökteki js/app.js'in
   aynı davranışı.

   NEDEN GEREKLİ: 470 görselin hepsi A101 ve Migros CDN'lerinden hotlink.
   O taraf hotlink'i engellerse ya da bir görsel kaldırılırsa kartlar
   birden kırık ikona döner. Yer tutucu (🏷️) o boşluğu kapatıyor.

   NEDEN TEK DİNLEYİCİ: 470 <img>'ye ayrı ayrı onError bağlamak, kartları
   sunucu bileşeni olmaktan çıkarıp hepsini istemciye taşımayı gerektirirdi
   — geçişin asıl kazancı olan sunucu render'ı bozulurdu. Bunun yerine
   belge düzeyinde TEK yakalama-evreli dinleyici var; <img> error olayı
   köpürmediği için capture şart. */
export default function GorselNobeti() {
  useEffect(() => {
    const dinle = (e: Event) => {
      const hedef = e.target as HTMLElement | null;
      if (!hedef || hedef.tagName !== "IMG") return;
      (hedef as HTMLImageElement).style.visibility = "hidden";
      const alan = hedef.closest(".kart-gorsel-alan, .detay-gorsel-alan");
      if (alan) alan.classList.add("gorsel-yok");
    };
    document.addEventListener("error", dinle, true);
    return () => document.removeEventListener("error", dinle, true);
  }, []);

  return null;
}
