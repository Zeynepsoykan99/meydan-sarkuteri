import { cacheLife } from "next/cache";
import { sqlAl } from "./veritabani";
import type { Katalog, Reyon, Urun } from "./tipler";

/* =====================================================================
   Katalog okuma. SQL yalnızca burada; sayfa bileşenlerine gömülmüyor.

   Önbellek: 'use cache' + cacheLife('minutes'). "minutes" profili
   revalidate = 1 dakika; bugünkü /api/katalog'un s-maxage=60 davranışının
   birebir karşılığı. Sahibi panelden fiyat güncellediğinde en geç bir
   dakikada yansıyor. Elle Cache-Control yazmıyoruz — Next 16'nın Cache
   Components modeli bunu yönetiyor.
   ===================================================================== */

/** numeric sütunlar sürücüden metin gelir; JSON'daki gibi sayı olmalı */
const sayi = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v);

type UrunSatiri = {
  id: string; ad: string; reyon: string; gorsel: string | null;
  fiyat: string | number; eski_fiyat: string | number | null;
  miktar: string | number | null; birim: string | null;
  stokta: boolean; kaynak: string | null;
};

const urunuCevir = (u: UrunSatiri): Urun => ({
  id: u.id,
  ad: u.ad,
  reyon: u.reyon,
  gorsel: u.gorsel,
  fiyat: sayi(u.fiyat) ?? 0,
  eskiFiyat: sayi(u.eski_fiyat),
  kaynak: u.kaynak,
  miktar: sayi(u.miktar),
  birim: u.birim,
  stokta: u.stokta,
});

export async function katalogGetir(): Promise<Katalog> {
  "use cache";
  cacheLife("minutes");

  const sql = sqlAl();
  const [reyonlar, urunler, damga] = await Promise.all([
    // "adet" YOK: reyon başına sayı arayüzde hesaplanıyor, böylece
    // sayaçla gerçek sayı ayrışamıyor.
    sql`SELECT id, ad, ikon FROM reyonlar ORDER BY sira NULLS LAST, id`,
    sql`SELECT id, ad, reyon, gorsel, fiyat, eski_fiyat, miktar, birim, stokta, kaynak
        FROM urunler ORDER BY id`,
    sql`SELECT max(guncellendi) AS en_son FROM urunler`,
  ]);

  return {
    guncellendi: (damga[0]?.en_son as Date | null)?.toISOString() ?? null,
    reyonlar: reyonlar as Reyon[],
    urunler: (urunler as UrunSatiri[]).map(urunuCevir),
  };
}

/** Tek ürün — detay sayfası ve generateMetadata için. */
export async function urunGetir(id: string): Promise<Urun | null> {
  "use cache";
  cacheLife("minutes");

  const sql = sqlAl();
  const satirlar = await sql`
    SELECT id, ad, reyon, gorsel, fiyat, eski_fiyat, miktar, birim, stokta, kaynak
    FROM urunler WHERE id = ${id}`;
  const u = (satirlar as UrunSatiri[])[0];
  return u ? urunuCevir(u) : null;
}

/** generateStaticParams için: yalnızca kimlikler. */
export async function urunKimlikleri(): Promise<string[]> {
  "use cache";
  cacheLife("minutes");

  const sql = sqlAl();
  const satirlar = await sql`SELECT id FROM urunler ORDER BY id`;
  return (satirlar as { id: string }[]).map((r) => r.id);
}

export async function reyonAdiGetir(): Promise<Map<string, string>> {
  "use cache";
  cacheLife("minutes");

  const sql = sqlAl();
  const satirlar = await sql`SELECT id, ad FROM reyonlar`;
  return new Map((satirlar as Reyon[]).map((r) => [r.id, r.ad]));
}
