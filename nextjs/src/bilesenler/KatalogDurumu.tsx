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
  /* Arama varken reyon başına eşleşen ürün sayısı ("hepsi" dahil); arama
     yokken null. Şerit rozetleri bunu gösteriyor: "Fırından 22" yazıp
     listede 2 ürün göstermek, reyonun açılmadığı izlenimini veriyordu.
     Sayıyı katalog hesaplıyor (ürün verisi orada), şerit okuyor. */
  aramaSayilari: Record<string, number> | null;
  aramaSayilariYaz: (v: Record<string, number> | null) => void;
};

const Baglam = createContext<Durum | null>(null);

export function KatalogDurumProvider({ children }: { children: React.ReactNode }) {
  const [arama, aramaYaz] = useState("");
  const [reyon, reyonYaz] = useState("hepsi");
  const [aramaSayilari, aramaSayilariYaz] = useState<Record<string, number> | null>(null);
  const deger = useMemo(
    () => ({ arama, aramaYaz, reyon, reyonYaz, aramaSayilari, aramaSayilariYaz }),
    [arama, reyon, aramaSayilari]);
  return <Baglam.Provider value={deger}>{children}</Baglam.Provider>;
}

export function useKatalogDurumu(): Durum {
  const d = useContext(Baglam);
  if (!d) throw new Error("KatalogDurumProvider dışında kullanıldı");
  return d;
}

export const katalogDurumu = useKatalogDurumu;
