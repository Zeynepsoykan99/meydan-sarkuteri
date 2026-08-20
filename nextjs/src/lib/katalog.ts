import { cacheLife } from "next/cache";
import { sqlAl } from "./veritabani";
import anlik from "../katalog-anlik.json";
import type { Katalog, Reyon, Urun } from "./tipler";

/* =====================================================================
   Katalog okuma. SQL yalnızca burada; sayfa bileşenlerine gömülmüyor.

   Önbellek: 'use cache' + cacheLife('minutes'). "minutes" profili
   revalidate = 1 dakika; bugünkü /api/katalog'un s-maxage=60 davranışının
   birebir karşılığı. Sahibi panelden fiyat güncellediğinde en geç bir
   dakikada yansıyor. Elle Cache-Control yazmıyoruz — Next 16'nın Cache
   Components modeli bunu yönetiyor.

   DERLEMEDEKİ KAYNAK DEĞİŞİKLİĞİ:
   'use cache' doldurma bütçesi sabit 50 saniye (use-cache-wrapper.js:520).
   Neon boştayken uyanma ~45 sn sürebiliyor ve bu maliyet doğrudan bütçenin
   içinde ödeniyordu — derleme rastgele çöküyordu (ILERLEME.md §14).
   db-isit.mjs ısıtma eklendi ama ısıtmadan sonra bile 49-51 sn gözlendi:
   askıda kalan bir 'use cache' doldurma işi var, giyotine çarpıyor.

   ÇÖZÜM: Derleme sırasında (NEXT_PHASE === 'phase-production-build')
   veritabanına HİÇ dokunmuyoruz. Prebuild betiğinin zaten ürettiği
   katalog-anlik.json'u okuyoruz. Böylece derleme süresi DB durumundan
   tamamen bağımsız hale geliyor.

   Çalışma zamanında (revalidate sonrası) her şey eskisi gibi: canlı
   veritabanından sorgu yapılıyor, düşerse yedeğe düşülüyor.
   ===================================================================== */

/** Derleme mi çalışma zamanı mı? */
const derlemeMi = process.env.NEXT_PHASE === "phase-production-build";

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

/** Anlık görüntüden oku — derleme zamanı veya veritabanı düşüşü. */
function anlikOku(yedekMi = false): Katalog {
  return {
    guncellendi: anlik.guncellendi,
    reyonlar: anlik.reyonlar as Reyon[],
    urunler: anlik.urunler as Urun[],
    ...(yedekMi ? { yedekMi: true } : {}),
  };
}

export async function katalogGetir(): Promise<Katalog> {
  "use cache";
  cacheLife("minutes");

  /* DERLEME ZAMANI: DB'ye dokunma, prebuild'in ürettiği kopyayı kullan.
     Bu blok 50 sn bütçesini HİÇ zorlamaz — disk okuması ~1 ms. */
  if (derlemeMi) {
    return anlikOku();
  }

  /* ÇALIŞMA ZAMANI: canlı veritabanından oku. */
  try {
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
  } catch (e) {
    /* YEDEĞE DÜŞME — kökteki data/products.json zincirinin karşılığı.
       Veritabanı okunamazsa sayfayı hata ekranıyla bırakmak yerine
       derleme anındaki kopyayı gösteriyoruz. Ziyaretçiye bunun bayat
       veri olduğu ve TARİHİ söyleniyor: tarihsiz bir "güncel olmayabilir"
       uyarısında bir günlük veri ile bir aylık veri aynı görünüyor. */
    console.error("katalog: veritabanı okunamadı, yedeğe düşülüyor:", (e as Error).message);
    return anlikOku(true);
  }
}

/** Tek ürün — detay sayfası ve generateMetadata için. */
export async function urunGetir(id: string): Promise<Urun | null> {
  const { urunler } = await katalogGetir();
  return urunler.find((u) => u.id === id) ?? null;
}

/** generateStaticParams için: yalnızca kimlikler. */
export async function urunKimlikleri(): Promise<string[]> {
  const { urunler } = await katalogGetir();
  return urunler.map((u) => u.id);
}

export async function reyonAdiGetir(): Promise<Map<string, string>> {
  const { reyonlar } = await katalogGetir();
  return new Map(reyonlar.map((r) => [r.id, r.ad]));
}
