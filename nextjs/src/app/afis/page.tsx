import type { Metadata } from "next";
import { dukkanGetir, doluMu } from "@/lib/dukkan";

export const metadata: Metadata = {
  title: "Kapı afişi — Meydan Şarküteri",
  robots: { index: false, follow: false },
};

export default async function AfisSayfasi() {
  const d = await dukkanGetir();

  const adresSatir = d?.adres?.satir ?? "Dikbıyık Mah. Atatürk Bul. No: 16A";
  const ilceIl = [d?.adres?.ilce, d?.adres?.il].filter(doluMu).join(" / ") || "Çarşamba / Samsun";
  const gecerli = (d?.saatler ?? []).filter(
    (k) => /^\d{1,2}:\d{2}$/.test(k.acilis) && /^\d{1,2}:\d{2}$/.test(k.kapanis)
  );
  const saatMetin = gecerli.length === 1
    ? `${gecerli[0].gunler} ${gecerli[0].acilis} – ${gecerli[0].kapanis}`
    : gecerli.length > 1
      ? gecerli.map((k) => `${k.gunler} ${k.acilis} – ${k.kapanis}`).join(", ")
      : "Her gün 07:30 – 22:00";
  const telefon = d?.iletisim?.telefon ?? "0362 854 11 44";

  return (
    <div className="afis-sarma flex justify-center bg-tezgah p-3 sm:p-6 print:bg-beyaz print:p-0">
      <style>{`
        @page {
          size: A4 portrait;
          margin: 0;
        }
        @media print {
          body, html {
            background: var(--color-beyaz) !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          header, #dukkan-serit, #dukkan, footer, .tente {
            display: none !important;
          }
          .afis-sarma {
            padding: 0 !important;
            background: transparent !important;
          }
          .afis-sayfa {
            width: 210mm !important;
            height: 297mm !important;
            min-height: 297mm !important;
            box-shadow: none !important;
            page-break-after: avoid !important;
            margin: 0 !important;
          }
        }
        @media screen and (max-width: 230mm) {
          .afis-sayfa {
            width: 100% !important;
            max-width: 210mm !important;
            min-height: 0 !important;
          }
        }
      `}</style>

      <div className="afis-sayfa box-border flex w-[210mm] min-h-[297mm] flex-col justify-between bg-beyaz p-[16mm] text-murekkep shadow-[0_8px_24px_-12px_rgba(27,25,23,0.18)]">
        {/* Üst */}
        <header className="flex items-center gap-[14px] border-b-2 border-murekkep pb-[10mm]">
          <span
            className="grid size-[22mm] shrink-0 place-items-center rounded-[5mm] bg-kirmizi
                       font-display text-[13mm] font-extrabold text-sari
                       shadow-[inset_0_-3px_0_rgb(0_0_0/0.16)]"
            aria-hidden="true"
          >
            M
          </span>
          <div>
            <p className="font-display text-[4.2mm] font-semibold uppercase tracking-[0.28em] text-kirmizi">
              Mahallenin tezgâhı
            </p>
            <p className="font-display text-[13mm] font-extrabold leading-[1.05] tracking-[-0.01em]">
              Meydan Şarküteri
            </p>
          </div>
        </header>

        {/* Orta */}
        <main className="flex flex-1 flex-col items-center justify-center gap-[8mm] py-[10mm]">
          <p className="text-center font-display text-[15mm] font-extrabold leading-[1.08] tracking-[-0.02em]">
            Fiyatlarımız <em className="not-italic text-kirmizi">burada</em>
          </p>

          <div className="box-border size-[103mm] max-w-[74vw] rounded-[4mm] border-[1.5mm] border-murekkep bg-beyaz p-[5mm]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/qr.svg"
              alt="Kare kodu okutunca meydan-sarkuteri.vercel.app adresine gidersiniz"
              width={340}
              height={340}
              className="block size-full"
            />
          </div>

          <p className="text-center text-[5mm] text-murekkep-soluk">
            Telefonun kamerasını kare koda tutun
          </p>
          <p className="rounded-full border border-cizgi px-[7mm] py-[3mm] text-center font-display text-[5.5mm] font-semibold tracking-[0.01em]">
            meydan-sarkuteri.vercel.app
          </p>
        </main>

        {/* Alt */}
        <footer className="flex flex-wrap items-end justify-between gap-[10mm] border-t-2 border-murekkep pt-[8mm]">
          <div className="text-[5mm] leading-[1.5]">
            <p className="mb-[1.5mm] text-[3.4mm] font-extrabold uppercase tracking-[0.16em] text-murekkep-soluk">
              Adres
            </p>
            <p>
              {adresSatir}<br />
              {ilceIl}
            </p>
            <p className="font-semibold">{saatMetin}</p>
          </div>

          <div className="text-right text-[5mm] leading-[1.5]">
            <p className="mb-[1.5mm] text-[3.4mm] font-extrabold uppercase tracking-[0.16em] text-murekkep-soluk">
              Telefon
            </p>
            <p className="whitespace-nowrap font-display text-[8mm] font-extrabold tracking-[0.01em]">
              {telefon}
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
