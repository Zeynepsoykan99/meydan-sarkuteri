"use client";

import { useEffect, useRef, useState } from "react";
import type { Urun } from "@/lib/tipler";
import { para } from "@/lib/bicim";

interface UrunSilModalProps {
  urun: Urun | null;
  onKapat: () => void;
  onOnay: (urun: Urun) => Promise<boolean>;
}

export default function UrunSilModal({
  urun,
  onKapat,
  onOnay,
}: UrunSilModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [islemde, setIslemde] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (urun) {
      if (!dialog.open) dialog.showModal();
    } else {
      if (dialog.open) dialog.close();
    }
  }, [urun]);

  if (!urun) return null;

  const gecmisAdet = urun.fiyatGecmisiSayisi ?? 0;

  async function handleSil() {
    if (!urun) return;
    setIslemde(true);
    setHata(null);

    const basarili = await onOnay(urun);
    if (!basarili) {
      setIslemde(false);
      setHata("Ürün silinemedi. Lütfen tekrar deneyin.");
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        e.preventDefault();
        if (!islemde) onKapat();
      }}
      className="m-auto w-full max-w-[460px] rounded-buyuk border-[1.5px] border-cizgi
                 bg-beyaz p-0 text-murekkep shadow-2xl backdrop:bg-murekkep/40"
    >
      <div className="p-6">
        <div className="flex items-center gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-full bg-kirmizi-sis text-xl text-kirmizi">
            🗑️
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-murekkep">
              Ürünü Silmek İstiyor musunuz?
            </h2>
            <p className="text-xs text-murekkep-soluk">
              Kimlik: <code className="font-mono font-bold">{urun.id}</code>
            </p>
          </div>
        </div>

        {/* Ürün Önizleme Kartı */}
        <div className="mt-4 flex items-center gap-3.5 rounded-orta border border-cizgi bg-tezgah p-3">
          <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-kucuk bg-beyaz border border-cizgi">
            {urun.gorsel ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={urun.gorsel}
                alt={urun.ad}
                className="size-full object-contain"
              />
            ) : (
              <span className="text-xl">🏷️</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[14px] font-bold text-murekkep">
              {urun.ad}
            </h3>
            <p className="mt-0.5 text-[13px] font-extrabold text-kirmizi">
              {para(urun.fiyat)}
            </p>
          </div>
        </div>

        {/* Onay metni ürünün ADINI ve birlikte silinecek fiyat geçmişi
            sayısını söylüyor. Geçmiş kayıtları fiyat_gecmisi'ne CASCADE bağlı;
            önceden sessizce siliniyordu ve metin bundan hiç söz etmiyordu. */}
        <p className="mt-4 text-[14px] leading-relaxed text-murekkep-soluk">
          <strong className="text-murekkep">“{urun.ad}”</strong> katalogdan ve
          veritabanından kalıcı olarak kaldırılacak.
          {gecmisAdet > 0 && (
            <>
              {" "}Bu ürünün{" "}
              <strong className="text-murekkep">
                {gecmisAdet} fiyat değişikliği kaydı
              </strong>{" "}
              da silinecek.
            </>
          )}{" "}
          Bu işlem <strong className="text-murekkep">geri alınamaz</strong>.
        </p>

        {hata && (
          <p
            role="alert"
            className="mt-3 rounded-orta border border-kirmizi bg-kirmizi-sis p-2.5 text-[13px] font-semibold text-kirmizi"
          >
            {hata}
          </p>
        )}

        <div className="mt-6 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onKapat}
            disabled={islemde}
            className="dugme dugme-hat min-h-11 px-4 text-[14px]"
          >
            Vazgeç
          </button>
          <button
            type="button"
            onClick={handleSil}
            disabled={islemde}
            className="dugme dugme-dolu min-h-11 bg-kirmizi hover:bg-kirmizi-koyu px-5 text-[14px] disabled:opacity-50"
          >
            {islemde ? "Siliniyor..." : "Evet, Ürünü Sil"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
