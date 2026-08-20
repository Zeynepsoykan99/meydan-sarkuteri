import Baslik from "@/bilesenler/Baslik";
import DukkanSerit from "@/bilesenler/DukkanSerit";
import DukkanBolum from "@/bilesenler/DukkanBolum";
import Altbilgi from "@/bilesenler/Altbilgi";
import GorselNobeti from "@/bilesenler/GorselNobeti";
import { KatalogDurumProvider } from "@/bilesenler/KatalogDurumu";

export default function VitrinLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
        <Baslik />
        <DukkanSerit />
        <main>{children}</main>
      </KatalogDurumProvider>

      <DukkanBolum />
      <Altbilgi />
      <GorselNobeti />
    </>
  );
}
