import { NextResponse } from "next/server";
import { connection } from "next/server";
import { sqlAl } from "@/lib/veritabani";
import anlik from "@/katalog-anlik.json";
import { oturumDogrula } from "@/lib/auth";
import { urunYuku } from "@/lib/yonetici";
import type { Reyon } from "@/lib/tipler";

/* Panelde gösterilen "yedek şu tarihli" damgası.
   ÖNCEDEN data/products.json'dan okunuyordu — ama o dosyaya hiçbir yerden
   YAZILMIYOR. Panel ürün ekleyip silerken damga yerinde sayıyor ve
   esnafa gerçekte olmayan bir tazelik bildiriyordu.
   Artık gerçekten derlemede tazelenen dosyadan okunuyor:
   src/katalog-anlik.json'u prebuild her derlemede yeniden yazıyor. */
function yedekDamgasi(): string | null {
  const a = anlik as { alindi?: string; guncellendi?: string | null };
  return a.alindi ?? a.guncellendi ?? null;
}

export async function GET() {
  await connection();
  try {
    const oturum = await oturumDogrula();
    if (!oturum) {
      return NextResponse.json(
        { hata: "Oturum gerekli" },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }

    const sql = sqlAl();
    const [reyonlar, urunler, damga, gecmisSayilari] = await Promise.all([
      sql`SELECT id, ad, ikon FROM reyonlar ORDER BY sira NULLS LAST, id`,
      sql`SELECT id, ad, reyon, gorsel, fiyat, eski_fiyat, miktar, birim,
                 stokta, kaynak, guncellendi
            FROM urunler ORDER BY id`,
      sql`SELECT max(guncellendi) AS en_son FROM urunler`,
      /* Silme onayında "kaç fiyat kaydı da gidecek" diyebilmek için.
         fiyat_gecmisi ürüne CASCADE bağlı: ürün silinince geçmişi de
         sessizce siliniyordu, onay metni bunu söylemiyordu. */
      sql`SELECT urun_id, count(*)::int AS adet
            FROM fiyat_gecmisi GROUP BY urun_id`,
    ]);

    const gecmis = new Map(
      (gecmisSayilari as { urun_id: string; adet: number }[])
        .map((r) => [r.urun_id, r.adet])
    );

    return NextResponse.json(
      {
        guncellendi: (damga[0]?.en_son as Date | null)?.toISOString() ?? null,
        yedekDamgasi: yedekDamgasi(),
        reyonlar: reyonlar as Reyon[],
        urunler: (urunler as Record<string, unknown>[]).map((u) => ({
          ...urunYuku(u, true),
          fiyatGecmisiSayisi: gecmis.get(u.id as string) ?? 0,
        })),
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    console.error("yonetici/urunler başarısız:", (e as Error).message);
    return NextResponse.json(
      { hata: "Ürünler okunamadı" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
