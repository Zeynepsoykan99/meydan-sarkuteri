import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { reyonAdiGetir, urunGetir, urunKimlikleri } from "@/lib/katalog";
import { birimFiyatYazi, etiketParcalari, indirimYuzde, para } from "@/lib/bicim";

/* Gerçek URL: /urun/u001. Bugünkü site ?urun= sorgu parametresi kullanıyor
   ve o sayfa indekslenmiyor. params Next 16'da Promise — await şart. */

export async function generateStaticParams() {
  const kimlikler = await urunKimlikleri();
  return kimlikler.map((id) => ({ id }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
  const { id } = await params;
  const u = await urunGetir(id);
  if (!u) return { title: "Ürün bulunamadı — Meydan Şarküteri" };

  const reyonlar = await reyonAdiGetir();
  const reyon = reyonlar.get(u.reyon) ?? "";
  const bf = birimFiyatYazi(u);
  const yuzde = indirimYuzde(u);

  const aciklama =
    `${u.ad} — ${para(u.fiyat)}` +
    (yuzde > 0 ? ` (%${yuzde} indirim)` : "") +
    (bf ? `, birim fiyatı ${bf}` : "") +
    `. ${reyon} reyonu, Meydan Şarküteri güncel etiket fiyatı.`;

  return {
    title: `${u.ad} — ${para(u.fiyat)} | Meydan Şarküteri`,
    description: aciklama,
    alternates: { canonical: `/urun/${u.id}` },
    openGraph: {
      title: `${u.ad} — ${para(u.fiyat)}`,
      description: aciklama,
      url: `/urun/${u.id}`,
      images: u.gorsel ? [{ url: u.gorsel }] : undefined,
    },
  };
}

export default async function UrunSayfasi(
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  /* BİLİNEN KUSUR (Next 16.2.12 + cacheComponents): generateStaticParams
     listesinde OLMAYAN bir id üretim derlemesinde 404 yerine 500 veriyor.
     Kaynağı build/templates/app-page.js: SSG rotasında notFound()
     revalidate 0 üretiyor, kod "0 < 1" diye reddediyor. Belgelenen çözüm
     `dynamicParams = false` cacheComponents ile uyumsuz; connection() ile
     isteği dinamik yapmak da işe yaramadı. next dev'de 404 doğru dönüyor,
     yalnızca üretim derlemesinde. 470 gerçek ürün adresi etkilenmiyor. */
  const u = await urunGetir(id);
  if (!u) notFound();

  const reyonlar = await reyonAdiGetir();
  const reyon = reyonlar.get(u.reyon) ?? "";
  const { lira, kurus } = etiketParcalari(u.fiyat);
  const bf = birimFiyatYazi(u);
  const yuzde = indirimYuzde(u);

  return (
    <article className="kucak py-10 md:py-14">
      <nav aria-label="Sayfa yolu" className="mb-6 text-[14px] text-murekkep-soluk">
        <Link href="/" className="text-inherit no-underline hover:text-murekkep">Katalog</Link>
        <span aria-hidden="true"> / </span>
        <span>{reyon}</span>
      </nav>

      <div className="grid gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="relative overflow-hidden rounded-buyuk border-[1.5px] border-cizgi bg-tezgah">
          {u.stokta === false && (
            <span className="absolute left-3 top-3 z-10 rounded-full bg-murekkep px-3 py-1
                             text-[12px] font-bold text-beyaz">Şu an yok</span>
          )}
          {yuzde > 0 && u.stokta !== false && (
            <span className="absolute left-3 top-3 z-10 rounded-full bg-kirmizi px-3 py-1
                             text-[12px] font-bold text-beyaz">%{yuzde} indirim</span>
          )}
          {u.gorsel && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={u.gorsel} alt={u.ad} width={600} height={600}
                 className={`aspect-square w-full object-contain
                             ${u.stokta === false ? "opacity-45 grayscale" : ""}`} />
          )}
        </div>

        <div>
          <p className="text-[11.5px] font-extrabold uppercase tracking-[0.1em] text-kirmizi">
            {reyon}
          </p>
          <h1 className="mt-2 text-[clamp(24px,3.6vw,34px)] leading-tight">{u.ad}</h1>

          <div className="mt-6 flex flex-wrap items-baseline gap-4">
            <span className="etiket etiket-l">
              <span className="lira">₺</span>{lira}<span className="kurus">,{kurus}</span>
            </span>
            {u.eskiFiyat && (
              <span className="eski-fiyat text-[16px]">
                ₺{u.eskiFiyat.toFixed(2).replace(".", ",")}
              </span>
            )}
          </div>

          {bf && <p className="mt-3 text-[15px]">Birim fiyatı <strong>{bf}</strong></p>}

          <dl className="mt-8 grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 border-t border-cizgi
                         pt-6 text-[15px]">
            <dt className="font-semibold text-murekkep-soluk">Durum</dt>
            <dd>{u.stokta === false ? "Şu an yok" : "Tezgâhta"}</dd>
            {u.miktar && u.birim && (
              <>
                <dt className="font-semibold text-murekkep-soluk">Miktar</dt>
                <dd>{String(u.miktar).replace(".", ",")} {u.birim}</dd>
              </>
            )}
            <dt className="font-semibold text-murekkep-soluk">Kaynak</dt>
            <dd>{KAYNAK_ADI[u.kaynak ?? ""] ?? "Belirtilmemiş"}</dd>
          </dl>

          <p className="mt-6 text-[14px] text-murekkep-soluk">
            Bu sayfa bir fiyat kataloğudur; sipariş alınmaz.
          </p>

          <Link href="/" className="dugme dugme-hat mt-8">← Katalog</Link>
        </div>
      </div>
    </article>
  );
}

/* 'dukkan' = fiyatı dükkânın kendisi girdi. Bunu Migros'a yazmak
   ziyaretçiye yanlış bilgi verirdi. */
const KAYNAK_ADI: Record<string, string> = {
  a101: "A101 Kapıda",
  migros: "Migros Sanal Market",
  dukkan: "Meydan Şarküteri",
};
