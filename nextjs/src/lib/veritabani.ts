import { neon } from "@neondatabase/serverless";

/* Aynı Neon veritabanı, aynı tablolar — şema değişmedi.
   neon() HTTP üzerinden tek atışlık sorgu yapıyor; sunucu bileşenlerinden
   çağrıldığı için havuz (Pool) gerekmiyor. */
export function sqlAl() {
  const adres = process.env.DATABASE_URL;
  if (!adres) throw new Error("DATABASE_URL tanımlı değil");
  return neon(adres);
}
