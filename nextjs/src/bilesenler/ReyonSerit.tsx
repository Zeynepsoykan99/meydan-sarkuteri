"use client";

import { usePathname, useRouter } from "next/navigation";
import type { Reyon } from "@/lib/tipler";
import { useKatalogDurumu } from "./KatalogDurumu";

/* Reyon şeridi — yapışkan başlığın parçası, eski sitedeki gibi.
   Önceden katalog bölümünün içindeydi ve aşağı kaydırınca ekrandan
   çıkıyordu: ziyaretçi reyon değiştirmek için hep başa dönmek zorundaydı.

   Seçim bağlamda (KatalogDurumu) duruyor; şerit başlıkta, katalog sayfada,
   ikisi ayrı ağaçta.

   Ürün detay sayfasındayken bir reyona basmak katalog sayfasına götürüyor:
   orada süzülecek bir liste yok, seçimi sessizce yutmak yanıltıcı olurdu. */
export default function ReyonSerit({
  reyonlar, sayilar, toplam,
}: {
  reyonlar: Reyon[];
  sayilar: Record<string, number>;
  toplam: number;
}) {
  const { reyon, reyonYaz, aramaSayilari } = useKatalogDurumu();
  const router = useRouter();
  const yol = usePathname();

  function sec(id: string) {
    reyonYaz(id);
    if (yol !== "/") router.push("/#katalog");
  }

  /* Rozet: arama yokken reyonun toplamı, arama varken o reyonda aramaya
     uyan ürün sayısı. İkisi aynı yerde durduğu için görünüşleri AYRI:
     arama sayısı sarı zeminli (vitrin sarısı), sıfırsa zeminsiz ve
     soluk. Ekran okuyucu için "ürün" / "sonuç" eki farkı söylüyor; ek
     rozetin DIŞINDA, .reyon-adet'in metni yalın sayı kalsın diye. */
  function rozet(id: string, toplamAdet: number) {
    if (!aramaSayilari) {
      return (
        <>
          <span className="reyon-adet">{toplamAdet}</span>
          <span className="sr-only"> ürün</span>
        </>
      );
    }
    const n = aramaSayilari[id] ?? 0;
    return (
      <>
        <span className="reyon-adet reyon-adet-arama" data-sifir={n === 0 ? "" : undefined}>
          {n}
        </span>
        <span className="sr-only"> sonuç</span>
      </>
    );
  }

  return (
    <nav aria-label="Reyonlar"
         className="border-t border-cizgi bg-beyaz">
      <div className="kucak -mx-5 overflow-x-auto px-5 py-2.5 md:mx-0 md:px-0">
        <div className="flex gap-2">
          <button type="button" className="reyon" aria-pressed={reyon === "hepsi"} data-reyon="hepsi"
                  onClick={() => sec("hepsi")}>
            <span aria-hidden="true">🧺</span> Tüm reyonlar
            {" "}{rozet("hepsi", toplam)}
          </button>
          {reyonlar.map((r) => (
            <button key={r.id} type="button" className="reyon" aria-pressed={reyon === r.id}
                    data-reyon={r.id} onClick={() => sec(r.id)}>
              {r.ikon && <span aria-hidden="true">{r.ikon}</span>} {r.ad}
              {" "}{rozet(r.id, sayilar[r.id] ?? 0)}
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}
