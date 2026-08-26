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

  /* KİLİT HER YOLDA AÇILIYOR — finally şart.

     ÖNCEKİ HÂLİ VE HATASI: setIslemde(false) yalnızca `if (!basarili)`
     dalındaydı. Başarılı silmede o dala hiç girilmiyor, yani bayrak
     `true` kalıyordu. Bileşen de sökülmüyordu (PanelArayuzu onu koşulsuz
     ve key'siz monte ediyordu), bu yüzden bayat `true` İKİNCİ silmeye
     taşınıyordu: modal açılır açılmaz "Siliniyor..." yazıyor, onay
     düğmesi devre dışı geliyor ve hiç istek gönderilmiyordu.
     Ölçüldü (26 Ağustos 2026, canlı): 1. silme DELETE→200, 2. silmede
     ağa TEK bir istek bile çıkmadı; ekran kalıcı kilitli kaldı.

     finally, `basarili`'nin değerinden ve `onOnay`'ın fırlatıp
     fırlatmadığından bağımsız olarak bayrağı sıfırlıyor. Başarı yolunda
     modal zaten kapanmış oluyor (urun null'a düşüyor), o yüzden gözle
     görülür bir titreşim üretmiyor. */
  async function handleSil() {
    if (!urun) return;
    setIslemde(true);
    setHata(null);

    try {
      const basarili = await onOnay(urun);
      if (!basarili) setHata("Ürün silinemedi. Lütfen tekrar deneyin.");
    } catch {
      /* onOnay kendi hatalarını yutuyor ama sözleşmesi buna söz vermiyor.
         Fırlatırsa da kilit açılmalı — kullanıcı ekranda mahsur kalmasın. */
      setHata("Beklenmedik bir hata oldu. Ürün silinemedi.");
    } finally {
      setIslemde(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      /* ESC HER ZAMAN KAPATIYOR — `islemde` koşulu bilerek kaldırıldı.
         Bir onay kutusunun kapanamaz hâle gelmesi kabul edilebilir bir
         durum değil: istek uzarsa ya da hiç sonuçlanmazsa kullanıcının
         tek çıkışı sayfayı yenilemek oluyordu (ölçüldü). Kapatmak zaten
         uçan isteği iptal etmiyor; sonucu üst bileşen bildiriyor. */
      onCancel={(e) => {
        e.preventDefault();
        onKapat();
      }}
      className="m-auto w-full max-w-[460px] rounded-buyuk border-[1.5px] border-cizgi
                 bg-beyaz p-0 text-murekkep shadow-2xl backdrop:bg-murekkep/40"
    >
      <div className="p-6">
        <div className="flex items-center gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-full bg-kirmizi-sis text-xl text-kirmizi">
            🗑️
          </div>
          <div className="flex-1">
            <h2 className="font-display text-lg font-bold text-murekkep">
              Ürünü Silmek İstiyor musunuz?
            </h2>
            <p className="text-xs text-murekkep-soluk">
              Kimlik: <code className="font-mono font-bold">{urun.id}</code>
            </p>
          </div>
          {/* ÜÇÜNCÜ ÇIKIŞ YOLU. Bu modalda kapatma düğmesi hiç yoktu;
              UrunEkleModal'da vardı. Vazgeç ve Esc'in yanına bunu da
              koyuyoruz — çıkışın tek bir düğmeye bağlı kalmaması için. */}
          <button
            type="button"
            onClick={onKapat}
            aria-label="Kapat"
            className="grid size-9 shrink-0 place-items-center rounded-full border border-cizgi
                       text-murekkep-soluk hover:border-murekkep hover:text-murekkep"
          >
            ✕
          </button>
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
          {/* VAZGEÇ HİÇ DEVRE DIŞI KALMIYOR — `disabled={islemde}` kaldırıldı.
              Devre dışı olan tek şey YIKICI eylem; çift gönderimi o
              engelliyor. Kapanma yolunu da kilitlemek, isteğin uzadığı
              her durumda kullanıcıyı ekranda mahsur bırakıyordu. */}
          <button
            type="button"
            onClick={onKapat}
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
