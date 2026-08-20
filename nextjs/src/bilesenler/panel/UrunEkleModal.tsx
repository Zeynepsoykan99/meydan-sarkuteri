"use client";

import { useEffect, useRef, useState } from "react";
import type { Reyon, Urun } from "@/lib/tipler";
import { sayiyaCevir } from "@/lib/bicim";
import { GECERLI_BIRIMLER } from "@/lib/yonetici";

interface UrunEkleModalProps {
  acik: boolean;
  reyonlar: Reyon[];
  onKapat: () => void;
  onEklendi: (yeniUrun: Urun) => void;
}

export default function UrunEkleModal({
  acik,
  reyonlar,
  onKapat,
  onEklendi,
}: UrunEkleModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [ad, setAd] = useState("");
  const [reyon, setReyon] = useState("");
  const [fiyatStr, setFiyatStr] = useState("");
  const [indirimli, setIndirimli] = useState(false);
  const [eskiFiyatStr, setEskiFiyatStr] = useState("");
  const [stokta, setStokta] = useState(true);
  const [miktarStr, setMiktarStr] = useState("");
  const [birim, setBirim] = useState("");
  const [gorsel, setGorsel] = useState("");

  const [hatalar, setHatalar] = useState<string[]>([]);
  const [gorselHata, setGorselHata] = useState(false);
  const [islemde, setIslemde] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (acik) {
      setAd("");
      setReyon(reyonlar[0]?.id ?? "");
      setFiyatStr("");
      setIndirimli(false);
      setEskiFiyatStr("");
      setStokta(true);
      setMiktarStr("");
      setBirim("");
      setGorsel("");
      setHatalar([]);
      setGorselHata(false);
      setIslemde(false);

      if (!dialog.open) dialog.showModal();
    } else {
      if (dialog.open) dialog.close();
    }
  }, [acik, reyonlar]);

  function formuSifirla() {
    setAd("");
    setFiyatStr("");
    setEskiFiyatStr("");
    setMiktarStr("");
    setBirim("");
    setGorsel("");
    setHatalar([]);
    onKapat();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setHatalar([]);

    // İstemci Doğrulaması
    const yerelHatalar: string[] = [];
    if (!ad.trim() || ad.trim().length < 2) {
      yerelHatalar.push("Ürün adı en az 2 karakter olmalıdır.");
    }
    if (!reyon) {
      yerelHatalar.push("Lütfen bir reyon seçin.");
    }

    const f = sayiyaCevir(fiyatStr);
    if (f === null || Number.isNaN(f as number) || !(f > 0)) {
      yerelHatalar.push("Geçerli bir satış fiyatı girin (ör. 45,50).");
    }

    let ef: number | null = null;
    if (indirimli) {
      ef = sayiyaCevir(eskiFiyatStr);
      if (ef === null || Number.isNaN(ef as number) || !(ef > 0)) {
        yerelHatalar.push("İndirimli ürünler için eski fiyat girilmelidir.");
      } else if (f !== null && !(ef > f)) {
        yerelHatalar.push("İndirimden önceki fiyat güncel fiyattan büyük olmalıdır.");
      }
    }

    let m: number | null = null;
    let b: string | null = birim || null;
    if (miktarStr.trim()) {
      m = sayiyaCevir(miktarStr);
      if (m === null || Number.isNaN(m as number) || !(m > 0)) {
        yerelHatalar.push("Miktar geçerli bir pozitif sayı olmalıdır.");
      }
      if (!b) {
        yerelHatalar.push("Miktar girdiğinizde ölçü birimi seçmelisiniz.");
      }
    } else if (b) {
      yerelHatalar.push("Ölçü birimi seçtiğinizde miktar girmelisiniz.");
    }

    if (b === "adet" && m !== null && !Number.isInteger(m)) {
      yerelHatalar.push('Birim "adet" olduğunda miktar tam sayı olmalıdır.');
    }

    if (yerelHatalar.length > 0) {
      setHatalar(yerelHatalar);
      return;
    }

    setIslemde(true);

    try {
      const res = await fetch("/api/yonetici/urun", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ad: ad.trim(),
          reyon,
          fiyat: f,
          eskiFiyat: ef,
          miktar: m,
          birim: b,
          stokta,
          gorsel: gorsel.trim() || null,
        }),
      });

      const veri = await res.json();

      if (!res.ok) {
        setHatalar(veri?.hatalar ?? [veri?.hata ?? "Ürün eklenemedi."]);
        return;
      }

      if (veri?.urun) {
        onEklendi(veri.urun);
        formuSifirla();
      }
    } catch {
      setHatalar(["Bağlantı hatası. Ürün kaydedilemedi."]);
    } finally {
      setIslemde(false);
    }
  }

  if (!acik) return null;

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        e.preventDefault();
        formuSifirla();
      }}
      className="m-auto w-full max-w-[560px] rounded-buyuk border-[1.5px] border-cizgi
                 bg-beyaz p-0 text-murekkep shadow-2xl backdrop:bg-murekkep/40"
    >
      <form onSubmit={handleSubmit} className="flex flex-col">
        {/* Başlık */}
        <div className="flex items-center justify-between border-b border-cizgi px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-full bg-yesil-sis text-lg">
              ✨
            </span>
            <h2 className="font-display text-xl font-bold">Yeni Ürün Ekle</h2>
          </div>
          <button
            type="button"
            onClick={formuSifirla}
            aria-label="Kapat"
            className="grid size-9 place-items-center rounded-full border border-cizgi
                       text-murekkep-soluk hover:border-murekkep hover:text-murekkep"
          >
            ✕
          </button>
        </div>

        {/* Gövde */}
        <div className="max-h-[75vh] overflow-y-auto px-6 py-5 space-y-4">
          {/* Hata Bildirimi */}
          {hatalar.length > 0 && (
            <div
              role="alert"
              className="rounded-orta border border-kirmizi bg-kirmizi-sis p-3 text-[14px] text-kirmizi"
            >
              <strong className="block font-bold">Lütfen hataları düzeltin:</strong>
              <ul className="mt-1 list-disc pl-4 space-y-0.5">
                {hatalar.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Ürün Adı */}
          <div>
            <label className="block text-[13.5px] font-bold text-murekkep">
              Ürün Adı <span className="text-kirmizi">*</span>
            </label>
            <input
              type="text"
              required
              value={ad}
              onChange={(e) => setAd(e.target.value)}
              placeholder="Örn: Ezine Klasik Beyaz Peynir 500 G"
              className="mt-1.5 w-full rounded-orta border-[1.5px] border-cizgi bg-tezgah px-3.5
                         py-2.5 text-[15px] outline-none focus:border-murekkep focus:bg-beyaz"
            />
          </div>

          {/* Reyon / Kategori */}
          <div>
            <label className="block text-[13.5px] font-bold text-murekkep">
              Reyon (Kategori) <span className="text-kirmizi">*</span>
            </label>
            <select
              value={reyon}
              onChange={(e) => setReyon(e.target.value)}
              className="mt-1.5 w-full rounded-orta border-[1.5px] border-cizgi bg-tezgah px-3.5
                         py-2.5 text-[15px] font-semibold text-murekkep outline-none focus:border-murekkep"
            >
              {reyonlar.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.ikon ? `${r.ikon} ` : ""}{r.ad}
                </option>
              ))}
            </select>
          </div>

          {/* Fiyat ve İndirim */}
          <div className="rounded-orta border border-cizgi bg-tezgah/50 p-3.5 space-y-3">
            <div>
              <label className="block text-[13.5px] font-bold text-murekkep">
                Satış Fiyatı (₺) <span className="text-kirmizi">*</span>
              </label>
              <div className="relative mt-1.5">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-murekkep-soluk">
                  ₺
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  value={fiyatStr}
                  onChange={(e) => setFiyatStr(e.target.value)}
                  placeholder="0,00"
                  className="w-full rounded-orta border-[1.5px] border-cizgi bg-beyaz pl-8 pr-3.5
                             py-2.5 text-[16px] font-bold outline-none focus:border-murekkep"
                />
              </div>
            </div>

            {/* İndirim Toggle */}
            <div className="pt-1">
              <label className="flex cursor-pointer items-center gap-2 text-[14px] font-semibold">
                <input
                  type="checkbox"
                  checked={indirimli}
                  onChange={(e) => setIndirimli(e.target.checked)}
                  className="size-4 rounded accent-kirmizi"
                />
                <span>Bu ürün indirimde mi?</span>
              </label>

              {indirimli && (
                <div className="mt-2.5 pl-6">
                  <label className="block text-[12.5px] font-bold text-murekkep-soluk">
                    İndirimden Önceki Fiyat (₺)
                  </label>
                  <div className="relative mt-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[14px] font-bold text-murekkep-soluk">
                      ₺
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={eskiFiyatStr}
                      onChange={(e) => setEskiFiyatStr(e.target.value)}
                      placeholder="Örn: 55,00"
                      className="w-full rounded-orta border-[1.5px] border-cizgi bg-beyaz pl-7 pr-3
                                 py-1.5 text-[14.5px] outline-none focus:border-murekkep"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Miktar ve Birim */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[13.5px] font-bold text-murekkep">
                Net Miktar
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={miktarStr}
                onChange={(e) => setMiktarStr(e.target.value)}
                placeholder="Örn: 0,5 veya 500"
                className="mt-1.5 w-full rounded-orta border-[1.5px] border-cizgi bg-tezgah px-3.5
                           py-2 text-[14.5px] outline-none focus:border-murekkep focus:bg-beyaz"
              />
            </div>
            <div>
              <label className="block text-[13.5px] font-bold text-murekkep">
                Ölçü Birimi
              </label>
              <select
                value={birim}
                onChange={(e) => setBirim(e.target.value)}
                className="mt-1.5 w-full rounded-orta border-[1.5px] border-cizgi bg-tezgah px-3
                           py-2 text-[14.5px] font-semibold outline-none focus:border-murekkep"
              >
                <option value="">(Belirtilmemiş)</option>
                {GECERLI_BIRIMLER.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Stok Durumu */}
          <div className="flex items-center justify-between rounded-orta border border-cizgi p-3 bg-tezgah/30">
            <div>
              <span className="block text-[14px] font-bold text-murekkep">
                Stok Durumu
              </span>
              <span className="text-[12.5px] text-murekkep-soluk">
                {stokta ? "Tezgâhta satışta" : "Tükendi (listede soluk görünür)"}
              </span>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={stokta}
                onChange={(e) => setStokta(e.target.checked)}
                className="sr-only peer"
              />
              <div
                className="h-6 w-11 rounded-full bg-cizgi peer-checked:bg-yesil
                           after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5
                           after:rounded-full after:bg-beyaz after:transition-all
                           peer-checked:after:translate-x-full"
              />
            </label>
          </div>

          {/* Görsel URL & Canlı Önizleme */}
          <div>
            <label className="block text-[13.5px] font-bold text-murekkep">
              Görsel URL&apos;si (İsteğe Bağlı)
            </label>
            <input
              type="url"
              value={gorsel}
              onChange={(e) => {
                setGorsel(e.target.value);
                setGorselHata(false);
              }}
              placeholder="https://... (Görsel adresi)"
              className="mt-1.5 w-full rounded-orta border-[1.5px] border-cizgi bg-tezgah px-3.5
                         py-2 text-[14px] outline-none focus:border-murekkep focus:bg-beyaz"
            />
            {gorsel.trim() && (
              <div className="mt-2.5 flex items-center gap-3 rounded-orta border border-cizgi bg-tezgah p-2">
                <div className="grid size-14 place-items-center overflow-hidden rounded-kucuk bg-beyaz border border-cizgi">
                  {!gorselHata ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={gorsel}
                      alt="Önizleme"
                      onError={() => setGorselHata(true)}
                      className="size-full object-contain"
                    />
                  ) : (
                    <span className="text-xs text-kirmizi font-bold">Kırık</span>
                  )}
                </div>
                <span className="text-xs text-murekkep-soluk">
                  {gorselHata
                    ? "Görsel yüklenemedi. Adresi kontrol edin."
                    : "Görsel önizlemesi başarılı."}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Alt Butonlar */}
        <div className="flex items-center justify-end gap-2.5 border-t border-cizgi bg-tezgah px-6 py-4">
          <button
            type="button"
            onClick={formuSifirla}
            disabled={islemde}
            className="dugme dugme-hat min-h-11 px-5 text-[14.5px]"
          >
            Vazgeç
          </button>
          <button
            type="submit"
            disabled={islemde}
            className="dugme dugme-dolu min-h-11 bg-yesil hover:bg-yesil-koyu px-6 text-[14.5px] disabled:opacity-50"
          >
            {islemde ? "Ekleniyor..." : "✨ Ürünü Kaydet"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
