import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sqlAl } from "@/lib/veritabani";
import {
  oturumDogrula,
  parolaDogrula,
  parolaHashle,
  oturumAc,
  CEREZ_ADI,
  OTURUM_GUN,
  istemciIp,
  basarisizDenemeSayisi,
  denemeKaydet,
  ASGARI_PAROLA,
  SINIR,
  PENCERE_DK,
} from "@/lib/auth";

export async function POST(req: Request) {
  const tur = req.headers.get("content-type") ?? "";
  if (!tur.toLowerCase().includes("application/json")) {
    return NextResponse.json(
      { hata: "Content-Type application/json olmalı" },
      { status: 415, headers: { "Cache-Control": "no-store" } }
    );
  }

  let sql;
  try {
    sql = sqlAl();
  } catch {
    return NextResponse.json(
      { hata: "Sunucu yapılandırması eksik" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }

  const ip = await istemciIp();

  try {
    const oturum = await oturumDogrula();
    if (!oturum) {
      return NextResponse.json(
        { hata: "Oturum gerekli" },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }

    if ((await basarisizDenemeSayisi(ip)) >= SINIR) {
      return NextResponse.json(
        { hata: `Çok fazla başarısız deneme. ${PENCERE_DK} dakika sonra tekrar deneyin.` },
        { status: 429, headers: { "Cache-Control": "no-store" } }
      );
    }

    let govde: Record<string, unknown> | null;
    try {
      govde = (await req.json()) as Record<string, unknown>;
    } catch {
      govde = null;
    }

    const mevcutSifre = govde?.mevcutSifre;
    const yeniSifre = govde?.yeniSifre;

    if (
      typeof mevcutSifre !== "string" ||
      typeof yeniSifre !== "string" ||
      !mevcutSifre ||
      !yeniSifre
    ) {
      return NextResponse.json(
        { hata: "mevcutSifre ve yeniSifre gerekli" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const kayitlar = await sql`
      SELECT id, kullanici_adi, parola_hash
        FROM yoneticiler
       WHERE id = ${oturum.yonetici_id}
       LIMIT 1
    `;
    const yonetici = kayitlar[0];
    if (!yonetici) {
      return NextResponse.json(
        { hata: "Oturum gerekli" },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }

    if (!(await parolaDogrula(mevcutSifre, yonetici.parola_hash))) {
      await denemeKaydet(ip, false);
      return NextResponse.json(
        { hata: "Mevcut şifre hatalı" },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }

    if (yeniSifre.length < ASGARI_PAROLA) {
      return NextResponse.json(
        { hata: `Yeni şifre en az ${ASGARI_PAROLA} karakter olmalı` },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }
    /* Buradaki === bilinçli ve güvenli: iki taraf da aynı istekten gelen
       düz metin, saklanan bir sır değil — sızacak bilgi yok. Saklanan
       parola hash'iyle karşılaştırma ASLA === ile yapılmaz, timingSafeEqual
       ile yapılır; gerekçesi lib/auth.ts'teki parolaDogrula'da. */
    if (yeniSifre === mevcutSifre) {
      return NextResponse.json(
        { hata: "Yeni şifre mevcut şifreyle aynı olamaz" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const yeniHash = await parolaHashle(yeniSifre);

    await sql`
      UPDATE yoneticiler
         SET parola_hash = ${yeniHash}, sifre_degistirmeli = false
       WHERE id = ${yonetici.id}
    `;

    await sql`DELETE FROM oturumlar WHERE yonetici_id = ${yonetici.id}`;
    const { jeton, biter } = await oturumAc(yonetici.id);

    await denemeKaydet(ip, true);

    const cookieStore = await cookies();
    /* secure koşullu — yerelde giriş yapılabilsin diye; gerekçesi ve riski
       api/giris/route.ts'te ayrıntılı yazılı. */
    cookieStore.set(CEREZ_ADI, jeton, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: OTURUM_GUN * 24 * 60 * 60,
    });

    return NextResponse.json(
      {
        degisti: true,
        kullaniciAdi: yonetici.kullanici_adi,
        sifreDegistirmeli: false,
        oturumBiter: biter.toISOString(),
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    console.error("sifre-degistir başarısız:", (e as Error).message);
    return NextResponse.json(
      { hata: "Şifre değiştirilemedi" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
