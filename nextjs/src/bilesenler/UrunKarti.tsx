import Link from "next/link";
import type { KartVerisi } from "@/lib/tipler";
import { etiketParcalari, indirimYuzde } from "@/lib/bicim";

/* Ürün kartı. Görsel için next/image DEĞİL düz <img>:
   470 görsel zaten uzak CDN'de 400×400; iyileştirici dönüştürme kotası
   harcar, kazanç düşük. Bu aşamanın ölçütü "birebir aynı görünmeli". */
export default function UrunKarti({
  u, reyonAdi, reyonGoster = true,
}: {
  u: KartVerisi;
  reyonAdi?: string;
  reyonGoster?: boolean;
}) {
  const yok = !u.stokta;
  const yuzde = indirimYuzde(u);
  const { lira, kurus } = etiketParcalari(u.fiyat);
  const bf = u.bfYazi;   // sunucuda hesaplandı

  return (
    <article className={`kart${yok ? " kart-yok" : ""}`} data-id={u.id}>
      <div className={`kart-gorsel-alan${u.gorsel ? "" : " gorsel-yok"}`}>
        {yok ? (
          <span className="kart-rozet absolute left-[9px] top-[9px] z-10 rounded-full bg-murekkep
                           px-2.5 py-1 text-[11.5px] font-bold text-beyaz">
            Şu an yok
          </span>
        ) : yuzde > 0 ? (
          <span className="kart-rozet absolute left-[9px] top-[9px] z-10 rounded-full bg-kirmizi
                           px-2.5 py-1 text-[11.5px] font-bold text-beyaz">
            %{yuzde} indirim
          </span>
        ) : null}
        {u.gorsel && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img className="kart-gorsel" src={u.gorsel} alt={u.ad}
               loading="lazy" decoding="async" width={400} height={400} />
        )}
      </div>

      {reyonGoster && reyonAdi && (
        <p className="mt-2.5 text-[11.5px] font-extrabold uppercase tracking-[0.1em] text-kirmizi">
          {reyonAdi}
        </p>
      )}

      <h3 className="mt-1 line-clamp-2 text-[15px] font-semibold leading-[1.35]" title={u.ad}>
        {/* prefetch KAPALI: Next görüş alanına giren her bağlantıyı önden
            getiriyor. 470 kartlık bir listede bu, kullanıcı hiçbirine
            tıklamasa bile onlarca ek istek demek — ölçümde 27 istek /
            81 KB. Ürün sayfaları zaten statik ve hızlı. */}
        <Link href={`/urun/${u.id}`} prefetch={false} className="text-inherit no-underline
                                                after:absolute after:inset-0 after:content-['']">
          {u.ad}
        </Link>
      </h3>

      <div className="mt-auto flex flex-wrap items-baseline gap-x-2.5 gap-y-1 pt-3">
        <span className="etiket etiket-s">
          <span className="lira">₺</span>{lira}<span className="kurus">,{kurus}</span>
        </span>
        {u.eskiFiyat && <span className="eski-fiyat">₺{u.eskiFiyat.toFixed(2).replace(".", ",")}</span>}
      </div>

      {bf && <p className="mt-1.5 text-[12.5px] text-murekkep-soluk">{bf}</p>}
    </article>
  );
}
