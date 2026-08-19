"use client";

import { createContext, useContext, useMemo, useState } from "react";

/* Başlıktaki arama kutusu ile katalog ayrı ağaçlarda duruyor (biri
   layout'ta, diğeri sayfada). Aralarındaki tek bağ arama metni; bunu
   küçük bir bağlamla paylaşıyoruz. Sunucu bileşenleri children olarak
   geçtiği için sunucuda çizilmeye devam ediyor. */

type Durum = {
  arama: string;
  aramaYaz: (v: string) => void;
};

const Baglam = createContext<Durum | null>(null);

export function KatalogDurumProvider({ children }: { children: React.ReactNode }) {
  const [arama, aramaYaz] = useState("");
  const deger = useMemo(() => ({ arama, aramaYaz }), [arama]);
  return <Baglam.Provider value={deger}>{children}</Baglam.Provider>;
}

export function katalogDurumu(): Durum {
  const d = useContext(Baglam);
  if (!d) throw new Error("KatalogDurumProvider dışında kullanıldı");
  return d;
}
