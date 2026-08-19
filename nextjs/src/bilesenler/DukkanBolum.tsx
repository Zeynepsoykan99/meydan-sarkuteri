import { Suspense } from "react";
import { dukkanGetir, doluMu, telAdresi, whatsappAdresi } from "@/lib/dukkan";
import AcikDurum from "./AcikDurum";

/* Katalogdan SONRA gelen ayrıntılı bölüm. Boş alanlar hiç çizilmiyor:
   telefon yoksa İletişim kutusu, sipariş ve ödeme yoksa o kutu kaybolur. */
export default async function DukkanBolum() {
  const d = await dukkanGetir();
  if (!d) return null;

  const a = d.adres ?? {};
  const adresSatirlari = [
    doluMu(a.satir) ? a.satir : null,
    [a.ilce, a.il].filter(doluMu).join(" / ") || null,
  ].filter(Boolean) as string[];

  const gecerli = (d.saatler ?? []).filter(
    (k) => /^\d{1,2}:\d{2}$/.test(k.acilis) && /^\d{1,2}:\d{2}$/.test(k.kapanis));

  const tel = d.iletisim?.telefon;
  const wa = doluMu(d.iletisim?.whatsapp)
    ? whatsappAdresi(d.iletisim!.whatsapp!, `Merhaba, ${d.ad ?? "dükkân"} hakkında bilgi almak istiyorum.`)
    : null;

  const odeme = (d.odeme ?? []).filter(doluMu);
  const sip = d.siparis ?? {};
  const siparisVar = sip.var && (doluMu(sip.aciklama) || doluMu(sip.teslimat));

  const kutular: React.ReactNode[] = [];

  if (adresSatirlari.length) {
    kutular.push(
      <Kutu key="adres" baslik="Adres">
        <p className="text-base leading-[1.55]">
          {adresSatirlari.map((s, i) => (
            <span key={i} className="block">{s}</span>
          ))}
        </p>
        {doluMu(a.haritaUrl) && (
          <a
            href={a.haritaUrl} target="_blank" rel="noopener noreferrer"
            className="mt-1.5 inline-flex min-h-11 items-center gap-1.5 border-b-2 border-transparent
                       font-bold text-[15px] text-kirmizi no-underline hover:border-kirmizi"
          >
            Haritada göster <span aria-hidden="true">↗</span>
          </a>
        )}
      </Kutu>
    );
  }

  if (gecerli.length) {
    kutular.push(
      <Kutu key="saat" baslik="Çalışma saatleri">
        <Suspense fallback={<p className="mb-3 h-[22px] w-[210px] animate-pulse rounded-full bg-cizgi" />}>
          <AcikDurum nerede="bolum" />
        </Suspense>
        <div className="grid gap-0.5">
          {gecerli.map((k, i) => (
            <div key={i}
                 className="flex justify-between gap-3.5 border-t border-cizgi py-[9px] text-[15px]
                            first:border-t-0">
              <span className="text-murekkep-soluk">{k.gunler}</span>
              <span className="whitespace-nowrap font-bold tabular-nums">
                {k.acilis} – {k.kapanis}
              </span>
            </div>
          ))}
        </div>
      </Kutu>
    );
  }

  if (doluMu(tel) || wa) {
    kutular.push(
      <Kutu key="iletisim" baslik="İletişim">
        <div className="grid gap-2">
          {doluMu(tel) && (
            <a
              href={telAdresi(tel)} aria-label={`Telefonla ara: ${tel}`}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-orta
                         border-[1.5px] border-cizgi bg-beyaz px-[18px] py-2.5 text-[15.5px]
                         font-bold text-murekkep no-underline hover:border-murekkep"
            >
              <span aria-hidden="true">📞</span> {tel}
            </a>
          )}
          {wa && (
            <a
              href={wa} target="_blank" rel="noopener noreferrer"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-orta
                         border-[1.5px] border-yesil bg-yesil px-[18px] py-2.5
                         text-[15.5px] font-bold text-beyaz no-underline hover:bg-yesil-koyu"
            >
              <span aria-hidden="true">💬</span> WhatsApp&apos;tan yaz
            </a>
          )}
        </div>
      </Kutu>
    );
  }

  if (siparisVar || odeme.length) {
    kutular.push(
      <Kutu key="siparis" baslik={sip.var ? "Sipariş ve ödeme" : "Ödeme"}>
        {siparisVar && doluMu(sip.aciklama) && <p>{sip.aciklama}</p>}
        {siparisVar && doluMu(sip.teslimat) && (
          <p className="mt-2 text-[14.5px] text-murekkep-soluk">{sip.teslimat}</p>
        )}
        {odeme.length > 0 && (
          <p className="mt-3 flex flex-wrap gap-1.5">
            {odeme.map((o) => (
              <span key={o}
                    className="rounded-full border-[1.5px] border-cizgi bg-beyaz px-[11px] py-[5px]
                               text-[13.5px] font-semibold">
                {o}
              </span>
            ))}
          </p>
        )}
      </Kutu>
    );
  }

  if (!kutular.length) return null;

  return (
    <section id="dukkan" className="border-t border-cizgi bg-beyaz py-11 md:py-16">
      <div className="kucak">
        <div className="mb-7">
          <h2 className="text-[clamp(26px,4vw,36px)]">{d.ad ?? "Dükkân"}</h2>
          <p className="mt-1.5 text-murekkep-soluk">Adres, çalışma saatleri ve iletişim.</p>
        </div>
        <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
          {kutular}
        </div>
      </div>
    </section>
  );
}

function Kutu({ baslik, children }: { baslik: string; children: React.ReactNode }) {
  return (
    <div className="rounded-buyuk border-[1.5px] border-cizgi bg-tezgah p-5">
      <h3 className="mb-3 text-[13px] font-extrabold uppercase tracking-[0.06em] text-murekkep-soluk">
        {baslik}
      </h3>
      {children}
    </div>
  );
}
