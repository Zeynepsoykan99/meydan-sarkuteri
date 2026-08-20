"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Reyon, Urun } from "@/lib/tipler";
import { para, sadelestir } from "@/lib/bicim";
import UrunDuzenleModal from "./UrunDuzenleModal";

const YEDEK_ESKI_GUN = 7;
const SERIT_ANAHTAR = "yedek-serit-kapatildi";

export default function PanelArayuzu() {
  const router = useRouter();

  const [yukleniyor, setYukleniyor] = useState(true);
  const [kullaniciAdi, setKullaniciAdi] = useState("");
  const [urunler, setUrunler] = useState<Urun[]>([]);
  const [reyonlar, setReyonlar] = useState<Reyon[]>([]);
  const [yedekDamgasi, setYedekDamgasi] = useState<string | null>(null);
  const [yedekKapatildi, setYedekKapatildi] = useState(false);

  const [arama, setArama] = useState("");
  const [seciliReyon, setSeciliReyon] = useState("hepsi");
  const [kontrolsuzSurgu, setKontrolsuzSurgu] = useState(false);
  const [olcusuzSurgu, setOlcusuzSurgu] = useState(false);

  const [duzenlenenUrun, setDuzenlenenUrun] = useState<Urun | null>(null);
  const [hataBildirim, setHataBildirim] = useState<{ mesaj: string; oturum?: boolean } | null>(null);
  const [hizliOnaylar, setHizliOnaylar] = useState<Set<string>>(new Set());

  // Veri yükleme
  useEffect(() => {
    try {
      const kapali = localStorage.getItem(SERIT_ANAHTAR);
      if (kapali === "1") setYedekKapatildi(true);
    } catch {
      // devam et
    }

    async function verileriYukle() {
      try {
        const res = await fetch("/api/yonetici/urunler", { cache: "no-store" });
        if (res.status === 401) {
          router.replace("/giris");
          return;
        }
        if (!res.ok) throw new Error("Veriler yüklenemedi");

        const veri = await res.json();
        setUrunler(veri.urunler ?? []);
        setReyonlar(veri.reyonlar ?? []);
        setYedekDamgasi(veri.yedekDamgasi ?? null);

        // Kullanıcı adını öğren
        const otRes = await fetch("/api/oturum", { cache: "no-store" });
        const otVeri = await otRes.json();
        if (otVeri?.kullaniciAdi) setKullaniciAdi(otVeri.kullaniciAdi);
      } catch {
        setHataBildirim({ mesaj: "Panel verileri yüklenemedi. Sayfayı yenileyin." });
      } finally {
        setYukleniyor(false);
      }
    }

    verileriYukle();
  }, [router]);

  async function handleCikis() {
    try {
      await fetch("/api/cikis", { method: "POST" });
    } catch {
      // devam et
    }
    router.replace("/giris");
  }

  function handleYedekKapat() {
    setYedekKapatildi(true);
    try {
      localStorage.setItem(SERIT_ANAHTAR, "1");
    } catch {
      // devam et
    }
  }

  // Reyon isimleri haritası
  const reyonAdlari = useMemo(
    () => new Map(reyonlar.map((r) => [r.id, r.ad])),
    [reyonlar]
  );

  // Arama dizini
  const aramaDizini = useMemo(
    () =>
      new Map(
        urunler.map((u) => [
          u.id,
          sadelestir(`${u.ad} ${reyonAdlari.get(u.reyon) ?? ""}`),
        ])
      ),
    [urunler, reyonAdlari]
  );

  // İstatistikler
  const onaylananAdet = useMemo(
    () => urunler.filter((u) => u.kaynak === "dukkan").length,
    [urunler]
  );
  const onaylanmamisAdet = urunler.length - onaylananAdet;
  const olcusuzAdet = useMemo(
    () => urunler.filter((u) => u.miktar === null || u.miktar === undefined).length,
    [urunler]
  );
  const ilerlemeYuzde = urunler.length
    ? Math.round((onaylananAdet / urunler.length) * 100)
    : 0;

  // Filtrelenmiş liste
  const filtrelenmisListe = useMemo(() => {
    const kelimeler = sadelestir(arama).split(/\s+/).filter(Boolean);

    return urunler.filter((u) => {
      if (seciliReyon !== "hepsi" && u.reyon !== seciliReyon) return false;
      if (kontrolsuzSurgu && u.kaynak === "dukkan") return false;
      if (olcusuzSurgu && u.miktar !== null && u.miktar !== undefined) return false;

      if (kelimeler.length > 0) {
        const metin = aramaDizini.get(u.id) ?? "";
        if (!kelimeler.every((k) => metin.includes(k))) return false;
      }
      return true;
    });
  }, [urunler, arama, seciliReyon, kontrolsuzSurgu, olcusuzSurgu, aramaDizini]);

  // Hızlı Fiyat Onayı
  async function handleHizliOnay(u: Urun): Promise<boolean> {
    if (hizliOnaylar.has(u.id)) return false;

    setHizliOnaylar((prev) => new Set(prev).add(u.id));

    try {
      const res = await fetch("/api/yonetici/urun", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: u.id, fiyat: u.fiyat }),
      });

      if (res.status === 401) {
        setHataBildirim({ mesaj: "Oturum sona erdi. Tekrar giriş yapın.", oturum: true });
        return false;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setHataBildirim({ mesaj: err?.hata ?? "Fiyat onaylanamadı." });
        return false;
      }

      const veri = await res.json();
      if (veri?.urun) {
        setUrunler((prev) =>
          prev.map((item) => (item.id === u.id ? { ...item, ...veri.urun } : item))
        );
      }
      return true;
    } catch {
      setHataBildirim({ mesaj: "Bağlantı kurulamadı. Fiyat onaylanamadı." });
      return false;
    } finally {
      setHizliOnaylar((prev) => {
        const next = new Set(prev);
        next.delete(u.id);
        return next;
      });
    }
  }

  // Modal Güncelleme
  async function handleGuncelle(
    yama: any,
    onceki: Urun
  ): Promise<{ basarili: boolean; uyarilar?: string[]; hatalar?: string[] }> {
    try {
      const res = await fetch("/api/yonetici/urun", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(yama),
      });

      if (res.status === 401) {
        setHataBildirim({ mesaj: "Oturum sona erdi.", oturum: true });
        return { basarili: false, hatalar: ["Oturum sona erdi. Lütfen tekrar giriş yapın."] };
      }

      const veri = await res.json();

      if (!res.ok) {
        return {
          basarili: false,
          hatalar: veri?.hatalar ?? [veri?.hata ?? "Güncelleme başarısız."],
        };
      }

      if (veri?.urun) {
        setUrunler((prev) =>
          prev.map((item) => (item.id === onceki.id ? { ...item, ...veri.urun } : item))
        );
      }

      return {
        basarili: true,
        uyarilar: veri?.uyarilar ?? [],
      };
    } catch {
      return {
        basarili: false,
        hatalar: ["Bağlantı kurulamadı. Değişiklik KAYDEDİLMEDİ."],
      };
    }
  }

  // Yedek eskiliği
  const yedekEskiMi = useMemo(() => {
    if (!yedekDamgasi) return true;
    const gun = (Date.now() - new Date(yedekDamgasi).getTime()) / (1000 * 60 * 60 * 24);
    return gun >= YEDEK_ESKI_GUN;
  }, [yedekDamgasi]);

  if (yukleniyor) {
    return (
      <div className="grid min-h-[60vh] place-items-center bg-tezgah">
        <p className="text-center text-murekkep-soluk" role="status">
          Kontrol ediliyor…
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-tezgah">
      {/* Başlık */}
      <header className="sticky top-0 z-30 border-b border-cizgi bg-beyaz">
        <div className="kucak grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-3">
          <Link href="/" className="flex items-center gap-2 text-inherit no-underline">
            <span
              className="grid size-[38px] place-items-center rounded-[10px] bg-kirmizi font-display text-xl font-extrabold text-sari shadow-[inset_0_-2px_0_rgb(0_0_0/0.16)]"
              aria-hidden="true"
            >
              M
            </span>
            <span className="flex flex-col leading-none">
              <strong className="font-display text-[19px] font-extrabold">Meydan</strong>
              <em className="text-[10px] font-bold not-italic uppercase tracking-[0.2em] text-kirmizi">
                Panel
              </em>
            </span>
          </Link>

          <div className="min-w-0 text-right">
            <span className="block truncate text-[14px] font-bold text-murekkep">
              {kullaniciAdi}
            </span>
          </div>

          <button
            type="button"
            onClick={handleCikis}
            className="dugme dugme-hat min-h-11 px-4 py-2 text-[14.5px]"
          >
            Çıkış
          </button>
        </div>
      </header>

      {/* Yedek Şeridi */}
      {yedekEskiMi && !yedekKapatildi && (
        <div className="kucak mt-4">
          <div
            className="flex items-start justify-between gap-3 rounded-orta border-[1.5px] border-sari-koyu bg-sari-sis p-3 text-[14.5px] leading-snug"
            role="status"
          >
            <p className="flex-1">
              ⚠️ <strong>Yedek uyarısı:</strong> Son veri yedeği{" "}
              {yedekDamgasi
                ? `${new Date(yedekDamgasi).toLocaleDateString("tr-TR")} tarihli (${Math.round((Date.now() - new Date(yedekDamgasi).getTime()) / (1000 * 60 * 60 * 24))} gün önce).`
                : "bulunamadı."}{" "}
              Yeni fiyatların kaybolmaması için kök dizinden <code>npm run yedek-al</code> komutunu çalıştırın.
            </p>
            <button
              type="button"
              onClick={handleYedekKapat}
              aria-label="Bildirimi kapat"
              className="grid size-11 place-items-center rounded-full text-murekkep-soluk hover:bg-murekkep/10 hover:text-murekkep"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Ana İçerik */}
      <main className="kucak pb-24 pt-5">
        {/* İlerleme */}
        <div className="mb-5">
          <p className="mb-2 text-[15px] font-semibold" aria-live="polite">
            <strong className="font-display text-lg">{onaylananAdet}</strong> / {urunler.length} ürün onaylandı (%{ilerlemeYuzde})
          </p>
          <div className="h-2 overflow-hidden rounded-full bg-cizgi">
            <div
              className="h-full rounded-full bg-kirmizi transition-all duration-300"
              style={{ width: `${ilerlemeYuzde}%` }}
            />
          </div>
        </div>

        {/* Araçlar */}
        <div className="mb-4 grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_220px] lg:grid-cols-[minmax(0,1fr)_220px_auto]">
          {/* Arama */}
          <div className="relative flex items-center">
            <svg
              className="absolute left-3.5 size-5 stroke-murekkep-soluk"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <circle cx="9" cy="9" r="6" />
              <path d="M13.5 13.5 18 18" />
            </svg>
            <input
              type="search"
              placeholder="Ürün ara…"
              value={arama}
              onChange={(e) => setArama(e.target.value)}
              className="min-h-12 w-full rounded-full border-[1.5px] border-cizgi bg-beyaz pl-11 pr-10 text-[16px] text-murekkep outline-none focus:border-murekkep focus-visible:outline focus-visible:outline-3 focus-visible:outline-sari"
            />
            {arama && (
              <button
                type="button"
                onClick={() => setArama("")}
                aria-label="Aramayı temizle"
                className="absolute right-2 grid size-9 place-items-center rounded-full text-murekkep-soluk hover:text-murekkep"
              >
                ✕
              </button>
            )}
          </div>

          {/* Reyon Seçimi */}
          <label className="block">
            <span className="sr-only">Reyon</span>
            <select
              value={seciliReyon}
              onChange={(e) => setSeciliReyon(e.target.value)}
              className="min-h-12 w-full rounded-full border-[1.5px] border-cizgi bg-beyaz px-4 text-[16px] font-semibold text-murekkep outline-none focus:border-murekkep"
            >
              <option value="hepsi">Tüm reyonlar ({urunler.length})</option>
              {reyonlar.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.ad}
                </option>
              ))}
            </select>
          </label>

          {/* Süzgeç Düğmeleri */}
          <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-1">
            <button
              type="button"
              aria-pressed={kontrolsuzSurgu}
              onClick={() => setKontrolsuzSurgu((v) => !v)}
              className={`inline-flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-full border-[1.5px] px-3.5 text-[14.5px] font-semibold transition-colors sm:flex-initial ${
                kontrolsuzSurgu
                  ? "border-kirmizi bg-kirmizi text-beyaz"
                  : "border-cizgi bg-beyaz text-murekkep hover:border-murekkep"
              }`}
            >
              <span>Onaylanmamış</span>
              <span
                className={`grid min-w-6 place-items-center rounded-full px-1.5 py-0.5 text-[12px] font-extrabold tabular-nums ${
                  kontrolsuzSurgu ? "bg-beyaz/25 text-beyaz" : "bg-cizgi text-murekkep"
                }`}
              >
                {onaylanmamisAdet}
              </span>
            </button>

            <button
              type="button"
              aria-pressed={olcusuzSurgu}
              onClick={() => setOlcusuzSurgu((v) => !v)}
              className={`inline-flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-full border-[1.5px] px-3.5 text-[14.5px] font-semibold transition-colors sm:flex-initial ${
                olcusuzSurgu
                  ? "border-kirmizi bg-kirmizi text-beyaz"
                  : "border-cizgi bg-beyaz text-murekkep hover:border-murekkep"
              }`}
            >
              <span>Ölçüsü eksik</span>
              <span
                className={`grid min-w-6 place-items-center rounded-full px-1.5 py-0.5 text-[12px] font-extrabold tabular-nums ${
                  olcusuzSurgu ? "bg-beyaz/25 text-beyaz" : "bg-cizgi text-murekkep"
                }`}
              >
                {olcusuzAdet}
              </span>
            </button>
          </div>
        </div>

        {/* Liste Özeti */}
        <p className="mb-3 text-[14px] text-murekkep-soluk" aria-live="polite">
          {filtrelenmisListe.length} ürün listeleniyor.
        </p>

        {/* Ürün Listesi */}
        {filtrelenmisListe.length === 0 ? (
          <div className="rounded-buyuk border-2 border-dashed border-cizgi p-12 text-center text-murekkep-soluk">
            Bu süzgeçlerle eşleşen ürün yok.
          </div>
        ) : (
          <div className="grid gap-2">
            {filtrelenmisListe.map((u) => {
              const onayli = u.kaynak === "dukkan";
              const olcusuz = u.miktar === null || u.miktar === undefined;
              const islemde = hizliOnaylar.has(u.id);

              return (
                <div key={u.id} className="flex items-stretch gap-2">
                  {/* Düzenleme Açıcı Kart */}
                  <button
                    type="button"
                    onClick={() => setDuzenlenenUrun(u)}
                    className="grid min-h-[68px] min-w-0 flex-1 grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-orta border-[1.5px] border-cizgi bg-beyaz p-2.5 text-left text-inherit transition-all hover:border-murekkep max-[430px]:min-h-[126px]"
                  >
                    {/* Görsel */}
                    {u.gorsel ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={u.gorsel}
                        alt=""
                        width={52}
                        height={52}
                        className={`size-[52px] rounded-kucuk bg-tezgah object-contain ${
                          onayli ? "opacity-40" : ""
                        }`}
                      />
                    ) : (
                      <div className="size-[52px] rounded-kucuk bg-tezgah" />
                    )}

                    {/* Ad ve Rozetler */}
                    <div className="min-w-0">
                      <p
                        className={`line-clamp-2 text-[15px] font-semibold leading-snug ${
                          onayli ? "text-murekkep-soluk" : "text-murekkep"
                        }`}
                      >
                        {u.ad}
                      </p>

                      <div className="mt-1 flex flex-wrap gap-1">
                        {!onayli && (
                          <span className="rounded-full bg-sari-rozet px-2 py-0.5 text-[11.5px] font-bold text-sari-metin">
                            Onaylanmadı
                          </span>
                        )}
                        {olcusuz && (
                          <span className="rounded-full bg-mavi-sis px-2 py-0.5 text-[11.5px] font-bold text-mavi-metin">
                            Ölçü yok
                          </span>
                        )}
                        {u.stokta === false && (
                          <span className="rounded-full bg-murekkep px-2 py-0.5 text-[11.5px] font-bold text-beyaz">
                            Yok
                          </span>
                        )}
                        {onayli && (
                          <span className="rounded-full bg-yesil-sis px-2 py-0.5 text-[11.5px] font-bold text-yesil-metin">
                            ✓ Dükkân
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Fiyat */}
                    <div className="text-right font-display text-[17px] font-extrabold tabular-nums">
                      <span className={onayli ? "text-murekkep-soluk" : "text-murekkep"}>
                        {para(u.fiyat)}
                      </span>
                      {u.eskiFiyat && (
                        <span className="block font-govde text-[12px] font-semibold text-murekkep-soluk line-through">
                          ₺{u.eskiFiyat.toFixed(2).replace(".", ",")}
                        </span>
                      )}
                    </div>
                  </button>

                  {/* Hızlı Onay Butonu */}
                  <button
                    type="button"
                    disabled={onayli || islemde}
                    onClick={() => handleHizliOnay(u)}
                    aria-label={`Fiyatı onayla: ${u.ad}`}
                    className={`grid min-h-[44px] w-[58px] place-content-center gap-0.5 rounded-orta border-[1.5px] text-center font-inherit transition-colors ${
                      onayli
                        ? "cursor-default border-yesil-metin bg-yesil-sis text-yesil-metin"
                        : "border-cizgi bg-beyaz text-murekkep-soluk hover:border-yesil-metin hover:bg-yesil-sis hover:text-yesil-metin"
                    }`}
                  >
                    <span className="text-lg leading-none">✓</span>
                    <span className="text-[10.5px] font-bold">
                      {onayli ? "Onaylı" : "Onayla"}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Düzenleme Modalı */}
      {duzenlenenUrun && (
        <UrunDuzenleModal
          urun={duzenlenenUrun}
          reyonAdi={reyonAdlari.get(duzenlenenUrun.reyon) ?? ""}
          onKapat={() => setDuzenlenenUrun(null)}
          onGuncelle={handleGuncelle}
          onHizliOnay={handleHizliOnay}
        />
      )}

      {/* Hata Bildirimi */}
      {hataBildirim && (
        <div
          className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-[560px] items-start gap-2.5 rounded-orta border-2 border-kirmizi bg-kirmizi-sis p-3.5 shadow-2xl text-kirmizi-koyu"
          role="alert"
        >
          <div className="flex-1 text-[14.5px] font-semibold leading-relaxed">
            <p>{hataBildirim.mesaj}</p>
            {hataBildirim.oturum && (
              <button
                type="button"
                onClick={() => router.replace("/giris")}
                className="dugme dugme-dolu mt-2 min-h-11 px-4 py-1.5 text-[14px]"
              >
                Giriş ekranına git
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setHataBildirim(null)}
            aria-label="Bildirimi kapat"
            className="grid size-11 place-items-center rounded-full text-lg hover:bg-kirmizi/10"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
