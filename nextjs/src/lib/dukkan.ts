import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { cacheLife } from "next/cache";
import type { Dukkan } from "./tipler";

/* Dükkân bilgisinin dosyadan okunması. Saat mantığı lib/saat.ts'te —
   orada next/* bağımlılığı yok, sınamalar doğrudan import edebiliyor. */

export * from "./saat";

/** data/dukkan.json — Vercel'de kök nextjs/ olduğunda dosya nextjs/data/
 *  altında duruyor (prebuild kopyalıyor). Yerelde iki yolu da deniyor. */
export async function dukkanGetir(): Promise<Dukkan | null> {
  "use cache";
  cacheLife("minutes");

  /* Önce nextjs/data/ — Vercel production'da bu çalışır.
     Yoksa eski ../data/ yolu — yerel geliştirme ve mevcut yapı. */
  const yollar = [
    join(process.cwd(), "data", "dukkan.json"),
    join(process.cwd(), "..", "data", "dukkan.json"),
  ];

  for (const yol of yollar) {
    try {
      const veri = JSON.parse(await readFile(yol, "utf8")) as Dukkan;
      if (!veri || typeof veri !== "object") continue;
      if (veri.dolduruldu !== true) return null;   // bayrak kapalı: hiç gösterme
      return veri;
    } catch {
      continue;   // bu yol yoksa sonraki dene
    }
  }
  return null;   // hiçbir yolda bulunamadı: bölüm çıkmaz
}

