import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { cacheLife } from "next/cache";
import type { Dukkan } from "./tipler";

/* Dükkân bilgisinin dosyadan okunması. Saat mantığı lib/saat.ts'te —
   orada next/* bağımlılığı yok, sınamalar doğrudan import edebiliyor. */

export * from "./saat";

/** data/dukkan.json depo kökünde; Next uygulaması nextjs/ altında. */
export async function dukkanGetir(): Promise<Dukkan | null> {
  "use cache";
  cacheLife("minutes");

  try {
    const yol = join(process.cwd(), "..", "data", "dukkan.json");
    const veri = JSON.parse(await readFile(yol, "utf8")) as Dukkan;
    if (!veri || typeof veri !== "object") return null;
    if (veri.dolduruldu !== true) return null;   // bayrak kapalı: hiç gösterme
    return veri;
  } catch {
    return null;   // dosya yok ya da bozuk: bölüm hiç çıkmaz
  }
}
