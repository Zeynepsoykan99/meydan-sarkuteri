"use client";

import { useEffect, useRef, useState } from "react";
import type { Urun } from "@/lib/tipler";
import { sayiyaCevir } from "@/lib/bicim";
import type { Yama } from "@/lib/yonetici";
import FiyatOnayModal from "./FiyatOnayModal";

interface UrunDuzenleModalProps {
  urun: Urun | null;
  reyonAdi: string;
  onKapat: () => void;
  onGuncelle: (
    yama: Yama,
    eskiUrun: Urun,
  ) => Promise<{ basarili: boolean; uyarilar?: string[]; hatalar?: string[] }>;
  onHizliOnay: (urun: Urun) => Promise<boolean>;
  onSilIstegi?: (urun: Urun) => void;
}

const SICRAMA = 10;

export default function UrunDuzenleModal({
  urun,
  reyonAdi,
  onKapat,
  onGuncelle,
  onHizliOnay,
  onSilIstegi,
}: UrunDuzenleModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [fiyatStr, setFiyatStr] = useState(() => (urun ? String(urun.fiyat).replace(".", ",") : ""));
  const [indirimli, setIndirimli] = useState(() => Boolean(urun?.eskiFiyat));
  const [eskiFiyatStr, setEskiFiyatStr] = useState(() => (urun?.eskiFiyat ? String(urun.eskiFiyat).replace(".", ",") : ""));
  const [stokta, setStokta] = useState(() => (urun ? urun.stokta !== false : true));
  const [miktarStr, setMiktarStr] = useState(() => (urun?.miktar ? String(urun.miktar).replace(".", ",") : ""));
  const [birim, setBirim] = useState(() => urun?.birim ?? "");

  const [hatalar, setHatalar] = useState<string[]>([]);
  const [uyarilar, setUyarilar] = useState<string[]>([]);
  const [oncekiUrun, setOncekiUrun] = useState<Urun | null>(null);
  const [islemde, setIslemde] = useState(false);
  const [sicramaBekliyor, setSicramaBekliyor] = useState<{ eski: number; yeni: number; yama: Yama } | null>(null);

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

  const onaylanmis = urun.kaynak === "dukkan";

  /* Geçersiz (NaN) alanlar — "₺39,50", "39,50 TL", "abc" gibi girdiler.
     Bunlar yamaya KOYULMAZ ve kullanıcıya söylenir. Sessizce yok saymak,
     fiyatın güncellenmediğini fark ettirmiyordu; miktarda ise daha kötüsü
     oluyordu: null'a düşüp ürünün ölçüsünü siliyordu. */
  function gecersizAlanlar() {
    const bozuk: string[] = [];
    if (Number.isNaN(sayiyaCevir(fiyatStr) as number)) bozuk.push("Fiyat");
    if (indirimli && Number.isNaN(sayiyaCevir(eskiFiyatStr) as number)) {
      bozuk.push("İndirimden önceki fiyat");
    }
    if (Number.isNaN(sayiyaCevir(miktarStr) as number)) bozuk.push("Miktar");
    return bozuk;
  }

  function hazirlaYama() {
    const f = sayiyaCevir(fiyatStr);
    const ef = indirimli ? sayiyaCevir(eskiFiyatStr) : null;
    const m = sayiyaCevir(miktarStr);
    const b = birim || null;

    const yama: Yama = { id: urun!.id };
    const gecerli = (v: unknown) => v !== null && !Number.isNaN(v as number);

    if (gecerli(f) && f !== urun!.fiyat) yama.fiyat = f as number;
    if (indirimli) {
      if (gecerli(ef) && ef !== urun!.eskiFiyat) yama.eskiFiyat = ef as number;
    } else if (urun!.eskiFiyat) {
      yama.eskiFiyat = null;
    }

    if (stokta !== (urun!.stokta !== false)) yama.stokta = stokta;
    // NaN'da miktara DOKUNMA: yoksa geçersiz girdi ölçüyü siler
    if (!Number.isNaN(m as number) && m !== urun!.miktar) yama.miktar = m as number;
    if (b !== (urun!.birim ?? null)) yama.birim = b;

    return { yama, f, ef, m, b };
  }

  async function kaydet(yama: Yama) {
    if (!urun) return;
    setIslemde(true);
    setHatalar([]);

    const onceki = { ...urun };
    const sonuc = await onGuncelle(yama, onceki);

    setIslemde(false);
    if (sonuc.basarili) {
      if (sonuc.uyarilar && sonuc.uyarilar.length > 0) {
        setUyarilar(sonuc.uyarilar);
        setOncekiUrun(onceki);
      } else {
        onKapat();
      }
    } else if (sonuc.hatalar) {
      setHatalar(sonuc.hatalar);
    }
  }

  async function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!urun || islemde) return;

    /* Bozuk alan varsa hiçbir şey gönderme ve NEDENİNİ söyle. Kaydet'in
       sessizce iş görmemesi, sahibinin "₺" ya da "TL" yazdığında neden
       bir şey olmadığını anlamamasına yol açıyordu. */
    const bozuk = gecersizAlanlar();
    if (bozuk.length) {
      setHatalar(
        bozuk.map((a) => `${a} sayı olmalı — örnek: 39,50 (₺ ya da TL yazmayın)`)
      );
      return;
    }

    const { yama, f } = hazirlaYama();

    // Değişiklik yoksa ve onaylanmamışsa direkt onayla
    const degisen = Object.keys(yama).filter((k) => k !== "id");
    if (degisen.length === 0) {
      if (!onaylanmis) {
        await handleFiyatDogru();
      } else {
        onKapat();
      }
      return;
    }

    // 10 kat sıçrama kontrolü
    if (f !== null && f > 0 && urun.fiyat > 0 && f !== urun.fiyat) {
      const kat = f / urun.fiyat;
      if (kat >= SICRAMA || kat <= 1 / SICRAMA) {
        setSicramaBekliyor({ eski: urun.fiyat, yeni: f, yama });
        return;
      }
    }

    await kaydet(yama);
  }

  /* Kapatırken kaydedilmemiş değişiklik varsa sor. Ölçüt hazirlaYama():
     alana dokunulup eski değere geri dönülmüşse değişiklik YOK sayılır,
     boşuna soru çıkmaz. */
  function kapatmayiDene() {
    if (islemde) return;
    const { yama } = hazirlaYama();
    const degisen = Object.keys(yama).filter((k) => k !== "id");
    if (degisen.length === 0 && gecersizAlanlar().length === 0) {
      onKapat();
      return;
    }
    if (window.confirm("Kaydedilmemiş değişiklik var. Çıkılsın mı?")) onKapat();
  }

  async function handleFiyatDogru() {
    if (!urun || islemde) return;
    setIslemde(true);
    const basarili = await onHizliOnay(urun);
    setIslemde(false);
    if (basarili) onKapat();
  }

  async function handleGeriAl() {
    if (!oncekiUrun || islemde) return;
    const yama = {
      id: oncekiUrun.id,
      fiyat: oncekiUrun.fiyat,
      eskiFiyat: oncekiUrun.eskiFiyat ?? null,
      miktar: oncekiUrun.miktar ?? null,
      birim: oncekiUrun.birim ?? null,
      stokta: oncekiUrun.stokta !== false,
    };
    await kaydet(yama);
    setOncekiUrun(null);
    setUyarilar([]);
  }

  return (
    <>
      <dialog
        ref={dialogRef}
        className="fixed inset-x-0 bottom-0 top-auto z-40 m-auto flex max-h-[92dvh] w-full max-w-[460px] flex-col rounded-t-buyuk border-0 bg-beyaz p-0 text-murekkep shadow-2xl backdrop:bg-murekkep/55 sm:inset-0 sm:top-0 sm:rounded-buyuk"
        onCancel={(e) => {
          e.preventDefault();
          kapatmayiDene();
        }}
      >
        <form onSubmit={handleSubmit} className="flex max-h-[92dvh] flex-col">
          {/* Üst */}
          <div className="grid grid-cols-[64px_minmax(0,1fr)_44px] items-center gap-3 border-b-[1.5px] border-cizgi p-4 sm:p-5">
            {urun.gorsel ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={urun.gorsel}
                alt=""
                width={64}
                height={64}
                className="size-16 rounded-orta bg-tezgah object-contain"
              />
            ) : (
              <div className="size-16 rounded-orta bg-tezgah" />
            )}
            <div>
              <p className="text-[11.5px] font-extrabold uppercase tracking-[0.1em] text-kirmizi">
                {reyonAdi}
              </p>
              <h2 className="line-clamp-2 text-[17px] font-bold leading-tight">{urun.ad}</h2>
            </div>
            <button
              type="button"
              onClick={kapatmayiDene}
              aria-label="Kapat"
              className="grid size-11 place-items-center rounded-full bg-tezgah text-lg hover:bg-cizgi"
            >
              ✕
            </button>
          </div>

          {/* Hatalar */}
          {hatalar.length > 0 && (
            <div className="mx-4 mt-3 rounded-orta border-[1.5px] border-kirmizi bg-kirmizi-sis p-3 text-[14.5px] font-semibold text-kirmizi-koyu" role="alert">
              <ul className="space-y-1">
                {hatalar.map((h, i) => (
                  <li key={i} className="flex gap-1.5">
                    <span>·</span>
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Uyarılar & Geri Al */}
          {uyarilar.length > 0 && (
            <div className="mx-4 mt-3 rounded-orta border-[1.5px] border-sari-koyu bg-sari-sis p-3 text-[14.5px]" role="alert">
              <ul className="space-y-1 font-medium">
                {uyarilar.map((u, i) => (
                  <li key={i}>{u}</li>
                ))}
              </ul>
              {oncekiUrun && (
                <button
                  type="button"
                  onClick={handleGeriAl}
                  className="dugme dugme-hat mt-2 min-h-11 px-4 py-1.5 text-[14px]"
                >
                  Geri al
                </button>
              )}
            </div>
          )}

          {/* Alanlar */}
          <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
            <div>
              <label className="block text-[13px] font-bold uppercase tracking-[0.05em] text-murekkep-soluk" htmlFor="d-fiyat">
                Fiyat (₺)
              </label>
              <input
                id="d-fiyat"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                enterKeyHint="done"
                value={fiyatStr}
                onChange={(e) => setFiyatStr(e.target.value)}
                className="mt-1.5 min-h-[50px] w-full rounded-orta border-[1.5px] border-cizgi bg-tezgah px-3.5 py-3 text-[17px] font-medium tabular-nums outline-none transition-colors focus:border-murekkep focus:bg-beyaz focus-visible:outline focus-visible:outline-3 focus-visible:outline-sari"
              />
            </div>

            {/* İndirim Switch */}
            <div>
              <label
                className={`flex min-h-[52px] cursor-pointer items-center gap-3 rounded-orta border-[1.5px] p-3 text-[16px] font-semibold transition-colors ${
                  indirimli
                    ? "border-kirmizi bg-kirmizi-sis"
                    : "border-cizgi bg-tezgah"
                }`}
              >
                <input
                  type="checkbox"
                  checked={indirimli}
                  onChange={(e) => setIndirimli(e.target.checked)}
                  className="size-6 accent-kirmizi"
                />
                <span>Bu ürün indirimli</span>
              </label>
            </div>

            {indirimli && (
              <div>
                <label className="block text-[13px] font-bold uppercase tracking-[0.05em] text-murekkep-soluk" htmlFor="d-eski">
                  İndirimden önceki fiyat (₺)
                </label>
                <input
                  id="d-eski"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  enterKeyHint="done"
                  value={eskiFiyatStr}
                  onChange={(e) => setEskiFiyatStr(e.target.value)}
                  className="mt-1.5 min-h-[50px] w-full rounded-orta border-[1.5px] border-cizgi bg-tezgah px-3.5 py-3 text-[17px] font-medium tabular-nums outline-none transition-colors focus:border-murekkep focus:bg-beyaz focus-visible:outline focus-visible:outline-3 focus-visible:outline-sari"
                />
              </div>
            )}

            {/* Stok Durumu */}
            <fieldset>
              <legend className="block text-[13px] font-bold uppercase tracking-[0.05em] text-murekkep-soluk">
                Stok durumu
              </legend>
              <div className="mt-1.5 space-y-2">
                <label
                  className={`flex min-h-12 cursor-pointer items-center gap-2.5 rounded-orta border-[1.5px] px-3.5 py-2 text-[16px] font-semibold transition-colors ${
                    stokta ? "border-murekkep bg-beyaz" : "border-cizgi bg-tezgah"
                  }`}
                >
                  <input
                    type="radio"
                    name="stok"
                    checked={stokta}
                    onChange={() => setStokta(true)}
                    className="size-5 accent-kirmizi"
                  />
                  <span>Tezgâhta</span>
                </label>

                <label
                  className={`flex min-h-12 cursor-pointer items-center gap-2.5 rounded-orta border-[1.5px] px-3.5 py-2 text-[16px] font-semibold transition-colors ${
                    !stokta ? "border-murekkep bg-beyaz" : "border-cizgi bg-tezgah"
                  }`}
                >
                  <input
                    type="radio"
                    name="stok"
                    checked={!stokta}
                    onChange={() => setStokta(false)}
                    className="size-5 accent-kirmizi"
                  />
                  <span>Şu an yok</span>
                </label>
              </div>
            </fieldset>

            {/* Miktar & Birim */}
            <div>
              <label className="block text-[13px] font-bold uppercase tracking-[0.05em] text-murekkep-soluk" htmlFor="d-miktar">
                Miktar <span className="text-[12.5px] font-medium lowercase tracking-normal text-murekkep-soluk">birim fiyat hesabı için</span>
              </label>
              <div className="mt-1.5 grid grid-cols-[1fr_120px] gap-2.5">
                <input
                  id="d-miktar"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="örn. 0,5"
                  value={miktarStr}
                  onChange={(e) => setMiktarStr(e.target.value)}
                  className="min-h-[50px] w-full rounded-orta border-[1.5px] border-cizgi bg-tezgah px-3.5 py-3 text-[17px] font-medium tabular-nums outline-none transition-colors focus:border-murekkep focus:bg-beyaz focus-visible:outline focus-visible:outline-3 focus-visible:outline-sari"
                />
                <select
                  id="d-birim"
                  value={birim}
                  onChange={(e) => setBirim(e.target.value)}
                  aria-label="Birim"
                  className="min-h-[50px] rounded-orta border-[1.5px] border-cizgi bg-tezgah px-3 text-[16px] font-semibold text-murekkep outline-none focus:border-murekkep"
                >
                  <option value="">—</option>
                  <option value="kg">kg</option>
                  <option value="L">L</option>
                  <option value="adet">adet</option>
                </select>
              </div>
            </div>
          </div>

          {/* Alt Düğmeler */}
          <div className="flex flex-wrap gap-2.5 border-t-[1.5px] border-cizgi bg-beyaz p-4 pb-[calc(16px+env(safe-area-inset-bottom,0px))] sm:p-5">
            {onSilIstegi && (
              <button
                type="button"
                onClick={() => {
                  if (urun) onSilIstegi(urun);
                }}
                disabled={islemde}
                title="Ürünü sil"
                className="dugme min-h-[52px] border-[1.5px] border-kirmizi/30 text-kirmizi hover:bg-kirmizi-sis px-4 text-[15px]"
              >
                🗑️ Sil
              </button>
            )}
            {!onaylanmis && (
              <button
                type="button"
                onClick={handleFiyatDogru}
                disabled={islemde}
                className="dugme dugme-hat min-h-[52px] whitespace-nowrap px-4 text-[15.5px] hover:border-yesil-vurgu hover:bg-yesil-sis hover:text-yesil-vurgu"
              >
                Fiyat doğru
              </button>
            )}
            <button
              type="submit"
              disabled={islemde}
              className="dugme dugme-dolu min-h-[52px] flex-1 text-[16.5px]"
            >
              {islemde ? "Kaydediliyor…" : "Kaydet"}
            </button>
          </div>
        </form>
      </dialog>

      {/* Sıçrama Onay Modalı */}
      {sicramaBekliyor && (
        <FiyatOnayModal
          acik={true}
          eskiFiyat={sicramaBekliyor.eski}
          yeniFiyat={sicramaBekliyor.yeni}
          onOnay={async () => {
            const { yama } = sicramaBekliyor;
            setSicramaBekliyor(null);
            await kaydet(yama);
          }}
          onVazgec={() => setSicramaBekliyor(null)}
        />
      )}
    </>
  );
}
