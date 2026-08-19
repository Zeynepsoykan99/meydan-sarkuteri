import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sqlAl } from "@/lib/veritabani";
import { CEREZ_ADI, jetonOzeti } from "@/lib/auth";

export async function POST() {
  const cookieStore = await cookies();
  const jeton = cookieStore.get(CEREZ_ADI)?.value;

  if (jeton) {
    try {
      const sql = sqlAl();
      await sql`DELETE FROM oturumlar WHERE token_hash = ${jetonOzeti(jeton)}`;
    } catch (e) {
      console.error("cikis: oturum silinemedi:", (e as Error).message);
    }
  }

  /* secure koşullu — yerelde giriş yapılabilsin diye; gerekçesi ve riski
     api/giris/route.ts'te ayrıntılı yazılı. Silme çerezinin bayrakları
     yazma çerezininkiyle birebir aynı olmalı, yoksa tarayıcı bunu farklı
     bir çerez sayar ve oturum çerezi silinmeden kalır. */
  cookieStore.set(CEREZ_ADI, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return NextResponse.json(
    { girisli: false },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
