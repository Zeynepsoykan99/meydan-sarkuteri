import { dukkanGetir, doluMu } from "@/lib/dukkan";
import { katalogGetir } from "@/lib/katalog";

export default async function Altbilgi() {
  const [d, katalog] = await Promise.all([dukkanGetir(), katalogGetir()]);
  const adres = d?.adres?.satir;
  const gecerli = (d?.saatler ?? []).filter(
    (k) => /^\d{1,2}:\d{2}$/.test(k.acilis) && /^\d{1,2}:\d{2}$/.test(k.kapanis));
  const saat = gecerli.length === 1
    ? `${gecerli[0].gunler} ${gecerli[0].acilis} – ${gecerli[0].kapanis}`
    : null;

  return (
    <footer className="mt-auto bg-murekkep text-beyaz">
      <div className="kucak grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1.4fr]">
        <div className="flex items-start gap-3.5">
          <span className="grid size-[42px] shrink-0 place-items-center rounded-[11px] bg-kirmizi
                           font-display text-2xl font-extrabold text-sari" aria-hidden="true">
            M
          </span>
          <p className="text-[14.5px] leading-relaxed">
            <strong className="font-display text-[17px]">{d?.ad ?? "Meydan Şarküteri"}</strong>
            <br />
            {[doluMu(adres) ? adres : null, saat].filter(Boolean).join(" · ")}
          </p>
        </div>

        <div>
          <h3 className="mb-3 text-[13px] font-extrabold uppercase tracking-[0.16em] text-sari">
            Reyonlar
          </h3>
          <ul className="grid gap-1.5 text-[14.5px]">
            {katalog.reyonlar.slice(0, 6).map((r) => (
              <li key={r.id}>
                <a href={`/#katalog`} className="inline-flex min-h-11 items-center text-beyaz/80 no-underline hover:text-beyaz">
                  {r.ad}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="mb-3 text-[13px] font-extrabold uppercase tracking-[0.16em] text-sari">
            Tezgâh notu
          </h3>
          <ul className="grid gap-1.5 text-[14.5px] text-beyaz/80">
            <li>Fiyatlar TL&apos;dir, KDV dahildir.</li>
            <li>Ürün görselleri ve fiyatları A101 Kapıda ile Migros Sanal Market
                kataloglarından alınmıştır.</li>
            <li>Bu sayfa bir fiyat kataloğudur; online sipariş alınmaz.</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-beyaz/12">
        <div className="kucak py-4 text-[13px] text-beyaz/60">
          © 2026 Meydan Şarküteri · Arayüz demosu
        </div>
      </div>
    </footer>
  );
}
