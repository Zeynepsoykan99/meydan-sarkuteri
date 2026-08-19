import { Suspense } from "react";
import { dukkanGetir, doluMu, telAdresi, whatsappAdresi } from "@/lib/dukkan";
import AcikDurum, { DurumIskeleti } from "./AcikDurum";

/* Hızlı erişim şeridi: açık/kapalı + telefon + WhatsApp.
   Sunucuda çiziliyor; açık/kapalı hesabı Europe/Istanbul'a sabit. */
export default async function DukkanSerit() {
  const d = await dukkanGetir();
  if (!d) return null;

  const tel = d.iletisim?.telefon;
  const wa = doluMu(d.iletisim?.whatsapp)
    ? whatsappAdresi(d.iletisim!.whatsapp!, `Merhaba, ${d.ad ?? "dükkân"} hakkında bilgi almak istiyorum.`)
    : null;
  const saatVar = (d.saatler ?? []).length > 0;
  if (!saatVar && !doluMu(tel) && !wa) return null;

  return (
    <div id="dukkan-serit" className="bg-murekkep text-beyaz">
      <div className="kucak flex flex-wrap items-center justify-between gap-x-[18px] gap-y-2.5 py-2.5">
        {saatVar && (
          <Suspense fallback={<DurumIskeleti />}>
            <AcikDurum nerede="serit" />
          </Suspense>
        )}
        {(doluMu(tel) || wa) && (
          <div className="flex flex-wrap gap-2">
            {doluMu(tel) && (
              <a
                href={telAdresi(tel)}
                aria-label={`Telefonla ara: ${tel}`}
                className="inline-flex min-h-11 items-center gap-[7px] whitespace-nowrap rounded-full
                           border-[1.5px] border-beyaz/30 px-4 py-2 text-[14.5px] font-bold
                           text-beyaz no-underline transition-colors hover:border-beyaz/55
                           hover:bg-beyaz/12 max-[560px]:flex-1 max-[560px]:justify-center"
              >
                <span aria-hidden="true">📞</span> {tel}
              </a>
            )}
            {wa && (
              <a
                href={wa} target="_blank" rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-[7px] whitespace-nowrap rounded-full
                           border-[1.5px] border-yesil bg-yesil px-4 py-2 text-[14.5px]
                           font-bold text-beyaz no-underline transition-colors hover:bg-yesil-koyu
                           max-[560px]:flex-1 max-[560px]:justify-center"
              >
                <span aria-hidden="true">💬</span> WhatsApp
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
