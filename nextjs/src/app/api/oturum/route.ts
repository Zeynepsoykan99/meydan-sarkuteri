import { NextResponse } from "next/server";
import { connection } from "next/server";
import { oturumDogrula } from "@/lib/auth";

export async function GET() {
  await connection();
  try {
    const oturum = await oturumDogrula();
    if (!oturum) {
      return NextResponse.json(
        { girisli: false },
        { status: 200, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      {
        girisli: true,
        kullaniciAdi: oturum.kullanici_adi,
        sifreDegistirmeli: oturum.sifre_degistirmeli === true,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    console.error("oturum sorgusu başarısız:", (e as Error).message);
    return NextResponse.json(
      { girisli: false },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }
}
