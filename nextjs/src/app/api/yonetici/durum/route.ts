import { NextResponse } from "next/server";
import { connection } from "next/server";
import { sqlAl } from "@/lib/veritabani";
import { oturumDogrula } from "@/lib/auth";

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
    const [{ adet }] = await sql`SELECT count(*)::int AS adet FROM urunler`;

    return NextResponse.json(
      {
        kullaniciAdi: oturum.kullanici_adi,
        oturumBiter: oturum.biter,
        sifreDegistirmeli: oturum.sifre_degistirmeli === true,
        urunSayisi: adet,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    console.error("yonetici/durum başarısız:", (e as Error).message);
    return NextResponse.json(
      { hata: "Durum okunamadı" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
