import Baslik from "@/bilesenler/Baslik";
import ReyonSerit from "@/bilesenler/ReyonSerit";
import { katalogGetir } from "@/lib/katalog";
import DukkanSerit from "@/bilesenler/DukkanSerit";
import DukkanBolum from "@/bilesenler/DukkanBolum";
import Altbilgi from "@/bilesenler/Altbilgi";
import GorselNobeti from "@/bilesenler/GorselNobeti";
import { KatalogDurumProvider } from "@/bilesenler/KatalogDurumu";

export default async function VitrinLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  /* Şerit için reyonlar ve sayılar. katalogGetir "use cache" olduğu için
     sayfanın da çağırması ek maliyet çıkarmıyor — aynı önbellek girdisi. */
  const { reyonlar, urunler } = await katalogGetir();
  const sayilar: Record<string, number> = {};
  for (const u of urunler) sayilar[u.reyon] = (sayilar[u.reyon] ?? 0) + 1;

  return (
    <>
      <a
        className="absolute left-4 -top-16 z-[100] rounded-b-orta bg-murekkep px-[18px] py-2.5
                   font-semibold text-beyaz no-underline transition-[top] focus:top-0"
        href="#katalog"
      >
        İçeriğe atla
      </a>

      <KatalogDurumProvider>
        {/* Başlık ve reyon şeridi TEK yapışkan blok: aşağı kaydırılınca
            ikisi de ekranda kalıyor, eski sitedeki gibi. */}
        <div className="sticky top-0 z-40 bg-beyaz shadow-[0_1px_0_rgb(233_228_218)]">
          <Baslik />
          <ReyonSerit reyonlar={reyonlar} sayilar={sayilar} toplam={urunler.length} />
        </div>
        <DukkanSerit />
        <main>{children}</main>
      </KatalogDurumProvider>

      <DukkanBolum />
      <Altbilgi />
      <GorselNobeti />
    </>
  );
}
