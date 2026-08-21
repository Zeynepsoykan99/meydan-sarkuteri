import type { Metadata } from "next";
import PanelArayuzu from "@/bilesenler/panel/PanelArayuzu";

export const metadata: Metadata = {
  title: "Panel — Meydan Şarküteri",
  robots: { index: false, follow: false },
};

export default function PanelSayfasi() {
  return <PanelArayuzu />;
}
