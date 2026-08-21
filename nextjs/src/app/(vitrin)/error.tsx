"use client";

import { useEffect } from "react";
import Link from "next/link";

/* =====================================================================
   Vitrin Hata Sınırı (Vitrin Error Boundary)
   Katalog veya ürün detay sayfalarındaki render hatalarını yakalar.
   Başlığı veya genel şablonu çökertmeden nazik bir hata ve kurtarma sunar.
   ===================================================================== */
export default function VitrinError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[VİTRİN_HATA]", error);
  }, [error]);

  return (
    <div className="kucak py-16 text-center">
      <div className="mx-auto max-w-[500px] rounded-buyuk border-[1.5px] border-cizgi bg-beyaz p-8 shadow-tezgah">
        <span
          className="mx-auto grid size-14 place-items-center rounded-orta bg-kirmizi-sis text-2xl"
          aria-hidden="true"
        >
          🧺
        </span>
        <h1 className="mt-4 text-[clamp(22px,3.5vw,28px)]">
          Katalog şu an yüklenemedi
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-murekkep-soluk">
          Fiyatlar getirilirken geçici bir bağlantı sorunu oluştu. Lütfen tekrar
          deneyin.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="dugme dugme-dolu"
          >
            Tekrar Dene
          </button>
          <Link href="/" prefetch={false} className="dugme dugme-hat">
            Ana Sayfa
          </Link>
        </div>
      </div>
    </div>
  );
}
