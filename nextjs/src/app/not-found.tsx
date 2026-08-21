import Link from "next/link";

export default function Bulunamadi() {
  return (
    <div className="kucak py-20 text-center">
      <h1 className="text-[clamp(28px,4vw,40px)]">Tezgâhta bulamadık.</h1>
      <p className="mx-auto mt-3 max-w-[46ch] text-murekkep-soluk">
        Aradığın ürün kaldırılmış ya da adres yanlış olabilir.
      </p>
      <Link href="/" prefetch={false} className="dugme dugme-dolu mt-7">Katalog</Link>
    </div>
  );
}
