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
const SEC = "img.kart-gorsel, .detay-gorsel-alan img";
const ALAN = ".kart-gorsel-alan, .detay-gorsel-alan";

export default function GorselNobeti() {
  useEffect(() => {
    // Mount anında halihazırda kırılmış görselleri tara (önbellek/hızlı hata)
    document.querySelectorAll<HTMLImageElement>(SEC).forEach((img) => {
      if (img.complete && img.naturalHeight === 0 && img.src) {
        img.style.visibility = "hidden";
        const alan = img.closest(ALAN);
        if (alan) alan.classList.add("gorsel-yok");
      } else if (img.complete) {
        /* Zaten gelmiş (önbellek): yer tutucuyu hemen kaldır. */
        img.closest(ALAN)?.classList.remove("gorsel-bekliyor");
      }
    });

    /* Yükleme bitince yer tutucuyu kaldır. load olayı da köpürmüyor,
       error gibi capture evresinde yakalanıyor.

       NEDEN SINIFI SUNUCU BASIYOR, BU KOD YALNIZCA KALDIRIYOR:
       Önce tersini denedim — sınıfı burada, hidrasyondan sonra
       ekliyordum. Ölçümde hiç görünmedi ve nedeni öğreticiydi: 153
       kbps'de 528 KB'lık JS paketi, 400×400'lük tek bir ürün görselinden
       çok sonra iniyor. Yani hidrasyon çalıştığında görsel ÇOKTAN gelmiş
       oluyordu; yer tutucu tam da gerektiği yavaş bağlantıda hiç
       çizilmiyordu. Sınıf sunucu HTML'inde olunca ilk boyamadan itibaren
       orada — JavaScript'ten önce.

       JS hiç çalışmazsa: CSS animasyonu sınırlı sayıda tekrar edip
       kendini saydama götürüyor (bkz. globals.css), yer tutucu kalıcı
       olarak görselin üstünde kalmıyor. */
    const yuklendi = (e: Event) => {
      const hedef = e.target as HTMLElement | null;
      if (!hedef || hedef.tagName !== "IMG") return;
      hedef.closest(ALAN)?.classList.remove("gorsel-bekliyor");
    };
    document.addEventListener("load", yuklendi, true);

    const dinle = (e: Event) => {
      const hedef = e.target as HTMLElement | null;
      if (!hedef || hedef.tagName !== "IMG") return;
      (hedef as HTMLImageElement).style.visibility = "hidden";
      const alan = hedef.closest(ALAN);
      if (alan) {
        alan.classList.remove("gorsel-bekliyor");   // hata da bir sonuçtur
        alan.classList.add("gorsel-yok");
      }
    };
    document.addEventListener("error", dinle, true);
    return () => {
      document.removeEventListener("error", dinle, true);
      document.removeEventListener("load", yuklendi, true);
    };
  }, []);

  return null;
}
