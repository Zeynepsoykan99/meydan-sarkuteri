import { connection } from "next/server";
import { dukkanGetir, durumHesapla } from "@/lib/dukkan";

/* "Şu an açık/kapalı" istekle birlikte hesaplanmak zorunda: şimdiki
   zamanı okuyor. Cache Components prerender sırasında new Date()'e izin
   vermiyor — haklı olarak, yoksa statik HTML'e donmuş bir saat gömülürdü.

   connection() ile bu parça prerender'dan çıkarılıyor; sayfanın geri
   kalanı statik kalıyor, durum akışla geliyor. Saat sunucuda
   hesaplandığı için ziyaretçinin cihaz saatine bağlı değil. */

export default async function AcikDurum({ nerede }: { nerede: "serit" | "bolum" }) {
  await connection();

  const d = await dukkanGetir();
  const durum = d ? durumHesapla(d.saatler) : null;
  if (!durum) return null;

  if (nerede === "serit") {
    return (
      <p className="flex items-center gap-[9px] text-[15px]">
        <Nokta acik={durum.acik} halka />
        <strong className="font-bold">{durum.metin}</strong>
        {durum.ayrinti && <span className="text-beyaz/70">{durum.ayrinti}</span>}
      </p>
    );
  }

  return (
    <p className="mb-3 flex flex-wrap items-center gap-[9px] text-[15px]">
      <Nokta acik={durum.acik} />
      <strong className={durum.acik ? "text-[#14713C]" : "text-kirmizi-koyu"}>
        {durum.metin}
      </strong>
      {durum.ayrinti && <span className="text-murekkep-soluk">· {durum.ayrinti}</span>}
    </p>
  );
}

function Nokta({ acik, halka = false }: { acik: boolean; halka?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`size-[9px] shrink-0 rounded-full ${acik ? "bg-[#3FBF6A]" : "bg-sari"} ${
        halka
          ? acik
            ? "shadow-[0_0_0_3px_rgb(63_191_106/0.25)]"
            : "shadow-[0_0_0_3px_rgb(255_206_0/0.2)]"
          : ""
      }`}
    />
  );
}

/** Akış beklenirken yer tutucu; düzen kaymasın diye aynı yükseklikte. */
export function DurumIskeleti() {
  return <p className="h-[22px] w-[190px] animate-pulse rounded-full bg-beyaz/15" />;
}
