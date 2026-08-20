"use client";

import { useMemo, useState } from "react";
import type { Reyon, Urun } from "@/lib/tipler";
import { birimFiyat, indirimYuzde, sadelestir } from "@/lib/bicim";
import UrunKarti from "./UrunKarti";
import { katalogDurumu } from "./KatalogDurumu";

/* İstemci adası: arama, reyon, sıralama, indirim ve fiyat aralığı.

   Ürün listesi sunucudan prop olarak geliyor; bu bileşen sunucuda da
   çiziliyor (client bileşenleri SSR'lanıyor), yani ilk HTML 470 kartı
   içeriyor. Etkileşim hidrasyondan sonra başlıyor. */

type Siralama = "onerilen" | "ucuz" | "pahali" | "birim" | "indirim" | "isim";

export default function KatalogBolumu({
  urunler, reyonlar,
}: {
  urunler: Urun[];
  reyonlar: Reyon[];
}) {
  const { arama } = katalogDurumu();
  const [reyon, setReyon] = useState<string>("hepsi");
  const [siralama, setSiralama] = useState<Siralama>("onerilen");
  const [indirimli, setIndirimli] = useState(false);
  const [enAz, setEnAz] = useState("");
  const [enCok, setEnCok] = useState("");

  const reyonAdlari = useMemo(
    () => new Map(reyonlar.map((r) => [r.id, r.ad])), [reyonlar]);

  // Arama dizini bir kez kuruluyor; her tuşta yeniden hesaplanmıyor
  const dizin = useMemo(
    () => new Map(urunler.map((u) => [u.id, sadelestir(`${u.ad} ${reyonAdlari.get(u.reyon) ?? ""}`)])),
    [urunler, reyonAdlari]);

  const reyonSayilari = useMemo(() => {
    const s = new Map<string, number>();
    for (const u of urunler) s.set(u.reyon, (s.get(u.reyon) ?? 0) + 1);
    return s;
  }, [urunler]);

  const liste = useMemo(() => {
    const kelimeler = sadelestir(arama).split(/\s+/).filter(Boolean);
    const az = enAz === "" ? null : Number(enAz);
    const cok = enCok === "" ? null : Number(enCok);

    const suzulmus = urunler.filter((u) => {
      if (reyon !== "hepsi" && u.reyon !== reyon) return false;
      if (indirimli && !u.eskiFiyat) return false;
      if (az !== null && u.fiyat < az) return false;
      if (cok !== null && u.fiyat > cok) return false;
      const metin = dizin.get(u.id) ?? "";
      return kelimeler.every((k) => metin.includes(k));
    });

    const bfDeger = (u: Urun) => birimFiyat(u)?.deger ?? Infinity;
    const bfGrup = (u: Urun) => {
      const bf = birimFiyat(u);
      if (!bf) return 2;
      return bf.birim === "adet" ? 1 : 0;
    };

    const kural: Record<Siralama, (a: Urun, b: Urun) => number> = {
      onerilen: () => 0,
      ucuz: (a, b) => a.fiyat - b.fiyat,
      pahali: (a, b) => b.fiyat - a.fiyat,
      // Önce ağırlık/hacim (kıyaslanabilir), sonra adet, en sonda birimsizler
      birim: (a, b) => bfGrup(a) - bfGrup(b) || bfDeger(a) - bfDeger(b),
      // Eşit indirim oranında ucuz olan önce — yoksa sıra rastgele kalıyor
      indirim: (a, b) => indirimYuzde(b) - indirimYuzde(a) || a.fiyat - b.fiyat,
      isim: (a, b) => a.ad.localeCompare(b.ad, "tr"),
    };

    /* Stokta olmayanlar HANGİ sıralama seçilirse seçilsin en sona.
       Tezgâhta olmayan ürünün listenin başında durması, ziyaretçiye
       alamayacağı şeyi öneriyor. Sort kararlı olduğu için "onerilen"de
       geri kalanların veri sırası korunuyor. */
    const stokSonra = (a: Urun, b: Urun) =>
      Number(a.stokta === false) - Number(b.stokta === false);

    return [...suzulmus].sort((a, b) => stokSonra(a, b) || kural[siralama](a, b));
  }, [urunler, dizin, arama, reyon, indirimli, enAz, enCok, siralama]);

  const bos = liste.length === 0;

  return (
    <section className="katalog scroll-mt-baslik py-11 md:py-16" id="katalog">
      <div className="kucak">
        {/* Reyon şeridi */}
        <nav aria-label="Reyonlar" className="mb-6 -mx-5 overflow-x-auto px-5">
          <div className="flex gap-2">
            <button type="button" className="reyon" aria-pressed={reyon === "hepsi"}
                    onClick={() => setReyon("hepsi")}>
              <span aria-hidden="true">🧺</span> Tüm reyonlar
              <span className="reyon-adet">{urunler.length}</span>
            </button>
            {reyonlar.map((r) => (
              <button key={r.id} type="button" className="reyon" aria-pressed={reyon === r.id}
                      onClick={() => setReyon(r.id)}>
                {r.ikon && <span aria-hidden="true">{r.ikon}</span>} {r.ad}
                <span className="reyon-adet">{reyonSayilari.get(r.id) ?? 0}</span>
              </button>
            ))}
          </div>
        </nav>

        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-[clamp(26px,4vw,36px)]">
              {reyon === "hepsi" ? "Bütün reyonlar" : reyonAdlari.get(reyon)}
            </h2>
            <p className="mt-1.5 text-murekkep-soluk" aria-live="polite" aria-atomic="true">
              {arama.trim()
                ? `"${arama.trim()}" için ${liste.length} ürün bulundu.`
                : `${liste.length} ürün listeleniyor.`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button" aria-pressed={indirimli}
              onClick={() => setIndirimli((v) => !v)}
              className={`inline-flex min-h-11 items-center gap-2 rounded-full border-[1.5px]
                          px-4 py-2 text-[14.5px] font-semibold transition-colors ${
                indirimli
                  ? "border-kirmizi bg-kirmizi text-beyaz"
                  : "border-cizgi bg-beyaz text-murekkep hover:border-murekkep"
              }`}
            >
              <span aria-hidden="true">🏷️</span> Sadece indirimliler
            </button>

            <div role="group" aria-label="Fiyat aralığı"
                 className="flex items-center gap-1.5 rounded-full border-[1.5px] border-cizgi
                            bg-beyaz px-3 py-1.5">
              <input type="number" min={0} step={1} inputMode="numeric" placeholder="En az ₺"
                     aria-label="En düşük fiyat" value={enAz}
                     onChange={(e) => setEnAz(e.target.value)}
                     className="w-[86px] bg-transparent py-1.5 text-[14.5px] outline-none" />
              <span aria-hidden="true" className="text-murekkep-soluk">–</span>
              <input type="number" min={0} step={1} inputMode="numeric" placeholder="En çok ₺"
                     aria-label="En yüksek fiyat" value={enCok}
                     onChange={(e) => setEnCok(e.target.value)}
                     className="w-[86px] bg-transparent py-1.5 text-[14.5px] outline-none" />
            </div>

            <label className="flex items-center gap-2 text-[14.5px] text-murekkep-soluk">
              <span>Sırala</span>
              <select
                value={siralama}
                onChange={(e) => setSiralama(e.target.value as Siralama)}
                className="min-h-11 rounded-full border-[1.5px] border-cizgi bg-beyaz px-3.5
                           text-[14.5px] font-semibold text-murekkep"
              >
                <option value="onerilen">Reyon sırası</option>
                <option value="ucuz">Artan fiyat</option>
                <option value="pahali">Azalan fiyat</option>
                <option value="birim">Birim fiyat (artan)</option>
                <option value="indirim">En çok indirim</option>
                <option value="isim">İsme göre (A–Z)</option>
              </select>
            </label>
          </div>
        </div>

        {bos ? (
          <div className="rounded-buyuk border-2 border-dashed border-cizgi px-5 py-12 text-center">
            <p className="font-display text-xl font-extrabold">Tezgâhta bulamadık.</p>
            <p className="mt-2 text-murekkep-soluk">
              Başka bir kelime dene ya da bütün reyonlara dön.
            </p>
            <button
              type="button"
              onClick={() => { setReyon("hepsi"); setIndirimli(false); setEnAz(""); setEnCok(""); }}
              className="dugme dugme-dolu mt-5"
            >
              Filtreleri sıfırla
            </button>
          </div>
        ) : (
          <div className="izgara">
            {liste.map((u) => (
              <UrunKarti key={u.id} u={u} reyonAdi={reyonAdlari.get(u.reyon)}
                         reyonGoster={reyon === "hepsi"} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
