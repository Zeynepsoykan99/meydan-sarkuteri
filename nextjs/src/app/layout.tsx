import type { Metadata } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import "./globals.css";
import DukkanSerit from "@/bilesenler/DukkanSerit";
import DukkanBolum from "@/bilesenler/DukkanBolum";
import Altbilgi from "@/bilesenler/Altbilgi";
import Baslik from "@/bilesenler/Baslik";
import { KatalogDurumProvider } from "@/bilesenler/KatalogDurumu";

/* Yazı tipleri next/font ile: uzak <link> yok, ağ isteği yok, düzen
   kayması yok. Değişken adları globals.css'teki @theme'e bağlanıyor. */
const display = Bricolage_Grotesque({
  subsets: ["latin", "latin-ext"],
  weight: ["600", "800"],
  variable: "--yazi-display",
  display: "swap",
});
const govde = Figtree({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "800"],
  variable: "--yazi-govde",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://meydan-sarkuteri.vercel.app"),
  title: "Meydan Şarküteri — Mahallenin tezgâhı",
  description:
    "Meydan Şarküteri (Çarşamba / Samsun) ürün kataloğu: 470 ürün, güncel etiket " +
    "fiyatlarıyla. Her gün 07:30 – 22:00 açık.",
  openGraph: {
    type: "website",
    locale: "tr_TR",
    siteName: "Meydan Şarküteri",
    title: "Meydan Şarküteri — Mahallenin tezgâhı",
    description:
      "Çarşamba / Samsun. 470 ürün, 13 reyon, güncel etiket fiyatları. " +
      "Her gün 07:30 – 22:00 açık.",
    url: "/",
    images: [{ url: "/og.png", width: 1200, height: 630,
      alt: "Meydan Şarküteri vitrini: Bugünün etiketleri, tek sayfada." }],
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className={`${display.variable} ${govde.variable}`}>
      <body>
        <a
          className="absolute left-4 -top-16 z-[100] rounded-b-orta bg-murekkep px-[18px] py-2.5
                     font-semibold text-beyaz no-underline transition-[top] focus:top-0"
          href="#katalog"
        >
          İçeriğe atla
        </a>

        {/* Tente: mahalle bakkalının kırmızı-beyaz şeridi */}
        <div className="tente" aria-hidden="true" />

        {/* Sağlayıcı istemci bileşeni; children sunucu bileşeni olarak
            geçtiği için sunucuda çizilmeye devam ediyor. */}
        <KatalogDurumProvider>
          <Baslik />
          {/* Sunucuda okunuyor; dukkan.json yoksa ya da bayrak kapalıysa
              bileşenin kendisi null dönüyor. */}
          <DukkanSerit />

          <main>{children}</main>
        </KatalogDurumProvider>

        <DukkanBolum />
        <Altbilgi />
      </body>
    </html>
  );
}
