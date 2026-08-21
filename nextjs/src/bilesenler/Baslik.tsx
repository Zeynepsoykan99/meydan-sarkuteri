import Link from "next/link";
import AramaKutusu from "./AramaKutusu";
import { dukkanGetir, doluMu } from "@/lib/dukkan";

/* Sunucu Bileşeni. Açılış bilgisi dukkan.json'dan; dosya yoksa ya da
   bayrak kapalıysa o satır hiç çizilmiyor. */
export default async function Baslik() {
  const d = await dukkanGetir();
  const adres = d?.adres?.satir;
  const gecerli = (d?.saatler ?? []).filter(
    (k) => /^\d{1,2}:\d{2}$/.test(k.acilis) && /^\d{1,2}:\d{2}$/.test(k.kapanis));
  const saat = gecerli.length === 1
    ? `${gecerli[0].gunler} ${gecerli[0].acilis} – ${gecerli[0].kapanis}`
    : gecerli.length > 1 ? "Çalışma saatleri aşağıda" : null;

  return (
    <header className="bg-beyaz">
      {/* Logoda prefetch KAPALI: ana sayfa 470 kart taşıyor, RSC yükü
          135 KB. Her ürün sayfasında bunu önden indirmek, ziyaretçi geri
          dönmese bile ödenen bir bedel. */}
      <div className="kucak grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-6 py-3.5">
        <Link href="/" prefetch={false} className="flex min-h-11 items-center gap-[11px] text-inherit no-underline">
          <span
            className="grid size-[42px] place-items-center rounded-[11px] bg-kirmizi
                       font-display text-2xl font-extrabold text-sari
                       shadow-[inset_0_-3px_0_rgb(0_0_0/0.16)]"
            aria-hidden="true"
          >
            M
          </span>
          <span className="flex flex-col leading-none">
            <strong className="font-display text-[22px] font-extrabold tracking-[-0.03em]">
              Meydan
            </strong>
            <em className="mt-[3px] text-[10.5px] font-semibold not-italic uppercase
                           tracking-[0.26em] text-kirmizi">
              Şarküteri
            </em>
          </span>
        </Link>

        <AramaKutusu />

        {(saat || adres) && (
          <p className="flex items-center gap-2.5 text-[13.5px] leading-tight text-murekkep-soluk
                        max-[860px]:hidden">
            <svg viewBox="0 0 24 24" aria-hidden="true"
                 className="size-[19px] shrink-0 fill-none stroke-murekkep-soluk stroke-2">
              <circle cx="12" cy="12" r="9" /><path d="M12 7v5.3l3.4 2" />
            </svg>
            <span>
              {saat && <strong className="block text-murekkep">{saat}</strong>}
              {doluMu(adres) && <span className="block">{adres}</span>}
            </span>
          </p>
        )}
      </div>
    </header>
  );
}
