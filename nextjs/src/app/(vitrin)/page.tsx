import { katalogGetir } from "@/lib/katalog";
import { etiketParcalari, indirimYuzde } from "@/lib/bicim";
import KatalogBolumu from "@/bilesenler/KatalogBolumu";
import Link from "next/link";

/* Sunucu Bileşeni. 470 ürün SUNUCUDA çiziliyor — geçişin asıl amacı bu.
   Bugünkü site kartları istemcide çiziyor, ham HTML'de tek ürün yok. */
export default async function AnaSayfa() {
  const { urunler, reyonlar, guncellendi } = await katalogGetir();

  const indirimliler = urunler
    .filter((u) => u.eskiFiyat && u.stokta !== false)
    .sort((a, b) => indirimYuzde(b) - indirimYuzde(a));
  const gunun = indirimliler[0];
  const tarih = guncellendi
    ? new Date(guncellendi).toLocaleDateString("tr-TR",
        { day: "numeric", month: "long", year: "numeric" })
    : null;

  return (
    <>
      {/* Vitrin */}
      <section className="border-b-[3px] border-murekkep bg-sari">
        <div className="kucak grid items-center gap-14 py-[68px] md:grid-cols-[1.15fr_0.85fr]">
          <div>
            <p className="inline-block rounded-full bg-murekkep px-[13px] py-1.5 text-xs
                          font-extrabold uppercase tracking-[0.2em] text-sari">
              Mahallenin tezgâhı
            </p>
            <h1 className="mt-[22px] text-[clamp(50px,8vw,96px)] leading-[1.02] tracking-[-0.025em]">
              Bugünün etiketleri,<br />
              <span className="text-kirmizi">tek sayfada.</span>
            </h1>
            <p className="mt-[22px] max-w-[46ch] text-[18px] leading-relaxed text-[#4A443E]">
              Meydan Şarküteri&apos;nin bütün reyonları ve güncel fiyatları.{" "}
              <strong>{urunler.length}</strong> ürünün etiketine mağazaya gelmeden bakabilirsin.
            </p>
            <div className="mt-[30px] flex flex-wrap gap-3">
              <a className="dugme dugme-dolu" href="#katalog">Reyonlara göz at</a>
              {gunun && <a className="dugme dugme-hat" href="#firsat">Düşen etiketler</a>}
            </div>
            <ul className="mt-[34px] flex flex-wrap gap-x-[26px] gap-y-2.5 border-t-[1.5px]
                           border-dashed border-murekkep/28 pt-[26px] text-[14.5px] font-medium">
              <li><span aria-hidden="true">🧊</span> Şarküteri reyonu her sabah yenilenir</li>
              {tarih && <li><span aria-hidden="true">🗓️</span> Fiyatlar {tarih} tarihli</li>}
            </ul>
          </div>

          {gunun && <GununEtiketi urun={gunun} reyonAdi={
            reyonlar.find((r) => r.id === gunun.reyon)?.ad ?? ""} />}
        </div>
      </section>

      {/* Düşen etiketler */}
      {indirimliler.length > 0 && (
        <section id="firsat" className="scroll-mt-baslik bg-tezgah py-11 md:py-14">
          <div className="kucak">
            <h2 className="text-[clamp(24px,3.4vw,32px)]">Düşen etiketler</h2>
            <p className="mt-1.5 text-murekkep-soluk">Bu hafta fiyatı geri çekilen ürünler.</p>
            <div className="mt-6 -mx-5 flex snap-x gap-4 overflow-x-auto px-5 pb-2"
                 role="list" tabIndex={0} aria-label="Düşen etiketler, yatay liste">
              {indirimliler.slice(0, 12).map((u) => (
                <Link key={u.id} href={`/urun/${u.id}`} role="listitem"
                      className="w-[210px] shrink-0 snap-start rounded-buyuk border-[1.5px]
                                 border-cizgi bg-beyaz p-3 text-inherit no-underline
                                 hover:border-murekkep">
                  {u.gorsel && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={u.gorsel} alt={u.ad} width={400} height={400} loading="lazy"
                         className="aspect-square w-full rounded-orta bg-tezgah object-contain" />
                  )}
                  <p className="mt-2 line-clamp-2 text-[14px] font-semibold">{u.ad}</p>
                  <p className="mt-2 flex items-baseline gap-2">
                    <Etiket fiyat={u.fiyat} />
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <KatalogBolumu urunler={urunler} reyonlar={reyonlar} />
    </>
  );
}

function Etiket({ fiyat, buyuk = false }: { fiyat: number; buyuk?: boolean }) {
  const { lira, kurus } = etiketParcalari(fiyat);
  return (
    <span className={`etiket ${buyuk ? "etiket-l" : "etiket-s"}`}>
      <span className="lira">₺</span>{lira}<span className="kurus">,{kurus}</span>
    </span>
  );
}

function GununEtiketi({ urun, reyonAdi }: { urun: import("@/lib/tipler").Urun; reyonAdi: string }) {
  return (
    <aside aria-label="Günün etiketi"
           className="relative ml-auto max-w-[420px] -rotate-[1.4deg] rounded-buyuk border-[3px]
                      border-murekkep bg-beyaz p-[26px]
                      shadow-[10px_12px_0_rgb(27_25_23/0.9)]">
      <p className="text-[11.5px] font-extrabold uppercase tracking-[0.18em] text-kirmizi">
        Günün etiketi
      </p>
      {urun.gorsel && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={urun.gorsel} alt={urun.ad} width={400} height={400}
             className="mx-auto mt-4 aspect-square w-full max-w-[260px] rounded-orta bg-tezgah object-contain" />
      )}
      <p className="mt-4 text-[11.5px] font-extrabold uppercase tracking-[0.1em] text-kirmizi">
        {reyonAdi}
      </p>
      <h2 className="mt-1 text-[19px] leading-snug">
        <Link href={`/urun/${urun.id}`} className="text-inherit no-underline hover:underline">
          {urun.ad}
        </Link>
      </h2>
      <div className="mt-4 flex flex-wrap items-baseline gap-3">
        <Etiket fiyat={urun.fiyat} buyuk />
        {urun.eskiFiyat && (
          <span className="eski-fiyat">₺{urun.eskiFiyat.toFixed(2).replace(".", ",")}</span>
        )}
      </div>
      <p className="mt-3 inline-block rounded-full bg-kirmizi px-3 py-1 text-[12.5px]
                    font-bold text-beyaz">
        %{indirimYuzde(urun)} indirim
      </p>
    </aside>
  );
}
