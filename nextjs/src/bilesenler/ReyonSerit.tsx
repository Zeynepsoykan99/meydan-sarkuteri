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
  const { reyon, reyonYaz } = useKatalogDurumu();
  const router = useRouter();
  const yol = usePathname();

  function sec(id: string) {
    reyonYaz(id);
    if (yol !== "/") router.push("/#katalog");
  }

  return (
    <nav aria-label="Reyonlar"
         className="border-t border-cizgi bg-beyaz">
      <div className="kucak -mx-5 overflow-x-auto px-5 py-2.5 md:mx-0 md:px-0">
        <div className="flex gap-2">
          <button type="button" className="reyon" aria-pressed={reyon === "hepsi"}
                  onClick={() => sec("hepsi")}>
            <span aria-hidden="true">🧺</span> Tüm reyonlar
            <span className="reyon-adet">{toplam}</span>
          </button>
          {reyonlar.map((r) => (
            <button key={r.id} type="button" className="reyon" aria-pressed={reyon === r.id}
                    onClick={() => sec(r.id)}>
              {r.ikon && <span aria-hidden="true">{r.ikon}</span>} {r.ad}
              <span className="reyon-adet">{sayilar[r.id] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}
