"use client";

import { useEffect } from "react";
import Link from "next/link";

/* =====================================================================
   Yönetici Paneli Hata Sınırı (Panel Error Boundary)
   Panel içi işlem ve veri yükleme hatalarını yakalar.
   ===================================================================== */
export default function PanelError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[PANEL_HATA]", error);
  }, [error]);

  return (
    <div className="kucak py-16 text-center">
      <div className="mx-auto max-w-[500px] rounded-buyuk border-[1.5px] border-cizgi bg-beyaz p-8 shadow-tezgah">
        <span
          className="mx-auto grid size-14 place-items-center rounded-orta bg-sari-sis text-2xl"
          aria-hidden="true"
        >
          ⚠️
        </span>
        <h1 className="mt-4 text-[clamp(22px,3.5vw,28px)]">
          Panel yüklenirken bir sorun oluştu
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-murekkep-soluk">
          Yönetici verileri alınırken bir hata meydana geldi. Oturum süreniz
          dolmuş veya bağlantı kesilmiş olabilir.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="dugme dugme-dolu"
          >
            Yeniden Dene
          </button>
          <Link href="/giris" className="dugme dugme-hat">
            Giriş Sayfası
          </Link>
        </div>
      </div>
    </div>
  );
}
