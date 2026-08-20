"use client";

import { useEffect } from "react";
/* Kök layout çöktüğü için onun stil içe aktarımı da düşüyor; temayı
   burada ayrıca almazsak sayfa stilsiz kalır. Ham hex yazmamak proje
   kuralı — kardeş error.tsx dosyalarıyla aynı sınıflar kullanılıyor. */
import "./globals.css";

/* =====================================================================
   Kök Hata Sınırı (Global Error Boundary)
   Kök layout çöktüğünde veya beklenmeyen bir React hatasında devreye girer.
   Kendi <html> ve <body> etiketlerini tanımlar.
   ===================================================================== */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GLOBAL_HATA]", error);
  }, [error]);

  return (
    <html lang="tr">
      <body className="grid min-h-screen place-items-center bg-tezgah p-5 text-murekkep">
        <div className="w-full max-w-[480px] rounded-buyuk border-[1.5px] border-cizgi bg-beyaz p-8 text-center shadow-tezgah">
          <span
            className="mx-auto grid size-14 place-items-center rounded-orta bg-kirmizi font-display text-2xl font-extrabold text-sari"
            aria-hidden="true"
          >
            M
          </span>
          <h1 className="mt-4 text-[clamp(22px,3.5vw,28px)]">
            Tezgâhta beklenmedik bir aksaklık oldu
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-murekkep-soluk">
            Sayfa yüklenirken geçici bir sorunla karşılaşıldı. Sayfayı
            yenileyerek tekrar deneyebilirsiniz.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => reset()}
              className="dugme dugme-dolu"
            >
              Yeniden Dene
            </button>
            {/* Kök layout çökmüşken next/link'e güvenilmez: tam sayfa yükleme. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" className="dugme dugme-hat">
              Kataloğa Dön
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
