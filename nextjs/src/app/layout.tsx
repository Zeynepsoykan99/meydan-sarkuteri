import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import "./globals.css";

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
  manifest: "/manifest.json",
  openGraph: {
    type: "website",
    locale: "tr_TR",
    siteName: "Meydan Şarküteri",
    title: "Meydan Şarküteri — Mahallenin tezgâhı",
    description:
      "Çarşamba / Samsun. 470 ürün, 13 reyon, güncel etiket fiyatları. " +
      "Her gün 07:30 – 22:00 açık.",
    url: "/",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Meydan Şarküteri vitrini: Bugünün etiketleri, tek sayfada.",
      },
    ],
  },
  twitter: { card: "summary_large_image" },
};

/* theme-color metadata.other ile değil viewport ile veriliyor: Next 16'nın
   desteklediği API bu. Değer temadaki --color-kirmizi ile aynı olmalı;
   meta etiketi CSS değişkeni okuyamadığı için tek yer burası ve
   public/manifest.json. Tema kırmızısı değişirse ikisi de güncellenmeli. */
export const viewport: Viewport = {
  themeColor: "#d6202a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className={`${display.variable} ${govde.variable}`}>
      <body>
        {/* Tente: mahalle bakkalının kırmızı-beyaz şeridi */}
        <div className="tente" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
