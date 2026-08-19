import { NextResponse } from "next/server";
import { connection } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { sqlAl } from "@/lib/veritabani";
import { oturumDogrula } from "@/lib/auth";
import { urunYuku } from "@/lib/yonetici";
import type { Reyon } from "@/lib/tipler";

async function yedekDamgasiOku(): Promise<string | null> {
  const yollar = [
    join(process.cwd(), "..", "data", "products.json"),
    join(process.cwd(), "data", "products.json"),
  ];
  for (const yol of yollar) {
    try {
      const veri = JSON.parse(await readFile(yol, "utf8"));
      if (typeof veri.guncellendi === "string") return veri.guncellendi;
    } catch {
      // devam et
    }
  }
  return null;
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
    const [reyonlar, urunler, damga, yedekDamga] = await Promise.all([
      sql`SELECT id, ad, ikon FROM reyonlar ORDER BY sira NULLS LAST, id`,
      sql`SELECT id, ad, reyon, gorsel, fiyat, eski_fiyat, miktar, birim,
                 stokta, kaynak, guncellendi
            FROM urunler ORDER BY id`,
      sql`SELECT max(guncellendi) AS en_son FROM urunler`,
      yedekDamgasiOku(),
    ]);

    return NextResponse.json(
      {
        guncellendi: (damga[0]?.en_son as Date | null)?.toISOString() ?? null,
        yedekDamgasi: yedekDamga,
        reyonlar: reyonlar as Reyon[],
        urunler: (urunler as any[]).map((u) => urunYuku(u, true)),
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
