"use client";

import { createContext, useContext, useMemo, useState } from "react";

/* Başlıktaki arama kutusu ile katalog ayrı ağaçlarda duruyor (biri
   layout'ta, diğeri sayfada). Aralarındaki tek bağ arama metni; bunu
   küçük bir bağlamla paylaşıyoruz. Sunucu bileşenleri children olarak
   geçtiği için sunucuda çizilmeye devam ediyor. */

type Durum = {
  arama: string;
  aramaYaz: (v: string) => void;
  /* Reyon seçimi de burada: şerit yapışkan başlıkta, katalog ise sayfada.
     İkisi ayrı ağaçlarda olduğu için seçim ancak bağlamla paylaşılabiliyor. */
  reyon: string;
  reyonYaz: (v: string) => void;
};

const Baglam = createContext<Durum | null>(null);

export function KatalogDurumProvider({ children }: { children: React.ReactNode }) {
  const [arama, aramaYaz] = useState("");
  const [reyon, reyonYaz] = useState("hepsi");
  const deger = useMemo(
    () => ({ arama, aramaYaz, reyon, reyonYaz }), [arama, reyon]);
  return <Baglam.Provider value={deger}>{children}</Baglam.Provider>;
}

export function useKatalogDurumu(): Durum {
  const d = useContext(Baglam);
  if (!d) throw new Error("KatalogDurumProvider dışında kullanıldı");
  return d;
}

export const katalogDurumu = useKatalogDurumu;
