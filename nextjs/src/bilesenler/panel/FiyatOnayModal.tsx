"use client";

import { useEffect, useRef } from "react";
import { para } from "@/lib/bicim";

interface FiyatOnayModalProps {
  acik: boolean;
  eskiFiyat: number;
  yeniFiyat: number;
  onOnay: () => void;
  onVazgec: () => void;
}

export default function FiyatOnayModal({
  acik,
  eskiFiyat,
  yeniFiyat,
  onOnay,
  onVazgec,
}: FiyatOnayModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (acik) {
      if (!dialog.open) dialog.showModal();
    } else {
      if (dialog.open) dialog.close();
    }
  }, [acik]);

  if (!acik) return null;

  return (
    <dialog
      ref={dialogRef}
      className="fixed inset-0 z-50 m-auto w-full max-w-[400px] rounded-buyuk border-0 bg-beyaz p-6 text-murekkep shadow-2xl backdrop:bg-murekkep/60"
      onCancel={(e) => {
        e.preventDefault();
        onVazgec();
      }}
    >
      <h2 className="text-xl font-bold">Bir dakika</h2>
      <p className="mt-2 text-[16px] leading-relaxed text-murekkep">
        Fiyat çok büyük oranda değişiyor. Emin misiniz?
      </p>

      <div className="my-4 rounded-orta bg-tezgah p-3 text-center font-display text-xl font-extrabold tabular-nums">
        <span>{para(eskiFiyat)}</span>
        <b className="mx-2 text-kirmizi">→</b>
        <span>{para(yeniFiyat)}</span>
      </div>

      <div className="mt-5 flex gap-3">
        <button
          type="button"
          onClick={onVazgec}
          className="dugme dugme-hat min-h-[52px] flex-1 text-[16px]"
        >
          Vazgeç
        </button>
        <button
          type="button"
          onClick={onOnay}
          className="dugme dugme-dolu min-h-[52px] flex-1 text-[16px]"
        >
          Evet
        </button>
      </div>
    </dialog>
  );
}
