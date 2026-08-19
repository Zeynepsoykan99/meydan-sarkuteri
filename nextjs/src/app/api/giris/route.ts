import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sqlAl } from "@/lib/veritabani";
import {
  parolaDogrula,
  SAHTE_HASH,
  oturumAc,
  CEREZ_ADI,
  OTURUM_GUN,
  istemciIp,
  basarisizDenemeSayisi,
  denemeKaydet,
  bakimZamaniMi,
  bakimYap,
  SINIR,
  PENCERE_DK,
} from "@/lib/auth";

const GENEL_HATA = "Kullanıcı adı veya şifre hatalı";

export async function POST(req: Request) {
  const tur = req.headers.get("content-type") ?? "";
  if (!tur.toLowerCase().includes("application/json")) {
    return NextResponse.json(
      { hata: "Content-Type application/json olmalı" },
      { status: 415, headers: { "Cache-Control": "no-store" } }
    );
  }

  let govde: any;
  try {
    govde = await req.json();
  } catch {
    govde = null;
  }

  const kullaniciAdi = govde?.kullaniciAdi;
  const parola = govde?.parola;

  if (
    typeof kullaniciAdi !== "string" ||
    typeof parola !== "string" ||
    !kullaniciAdi ||
    !parola
  ) {
    return NextResponse.json(
      { hata: "kullaniciAdi ve parola gerekli" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
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
    if (bakimZamaniMi()) await bakimYap();

    const basarisiz = await basarisizDenemeSayisi(ip);
    if (basarisiz >= SINIR) {
      return NextResponse.json(
        { hata: `Çok fazla başarısız deneme. ${PENCERE_DK} dakika sonra tekrar deneyin.` },
        { status: 429, headers: { "Cache-Control": "no-store" } }
      );
    }

    const kayitlar = await sql`
      SELECT id, kullanici_adi, parola_hash, sifre_degistirmeli
        FROM yoneticiler
       WHERE kullanici_adi = ${kullaniciAdi}
       LIMIT 1
    `;
    const yonetici = kayitlar[0];

    const dogru = await parolaDogrula(parola, yonetici?.parola_hash ?? SAHTE_HASH);

    if (!yonetici || !dogru) {
      await denemeKaydet(ip, false);
      return NextResponse.json(
        { hata: GENEL_HATA },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }

    const { jeton, biter } = await oturumAc(yonetici.id);
    await sql`UPDATE yoneticiler SET son_giris = now() WHERE id = ${yonetici.id}`;
    await denemeKaydet(ip, true);

    const cookieStore = await cookies();
    /* secure NEDEN KOŞULLU (bu koşulun gerekçesi cikis ve sifre-degistir
       uçları için de geçerli):
       Secure işaretli çerez yalnızca HTTPS üzerinden yazılır. Yerel
       geliştirme http://localhost üzerinden gittiği için koşulsuz Secure
       yazsaydık tarayıcı çerezi hiç saklamaz, yerelde giriş yapmak
       imkânsız olurdu. Kök projede bu sorun yoktu: orası yalnızca
       Vercel'de çalışıyordu, o yüzden koşulsuz "Secure" yazabiliyordu.

       RİSK: koruma artık NODE_ENV'in doğruluğuna bağlı. NODE_ENV
       "production" dışında bir değerle üretime çıkılırsa oturum çerezi
       düz HTTP üzerinden de gider; ağı dinleyen biri jetonu okuyup
       oturumu devralabilir. next build + next start bu değeri kendisi
       "production" yapar, dolayısıyla normal dağıtımda güvenlidir —
       ama NODE_ENV'i elle ayarlayan bir dağıtım bu güvenceyi kırar. */
    cookieStore.set(CEREZ_ADI, jeton, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: OTURUM_GUN * 24 * 60 * 60,
    });

    return NextResponse.json(
      {
        girisli: true,
        kullaniciAdi: yonetici.kullanici_adi,
        sifreDegistirmeli: yonetici.sifre_degistirmeli === true,
        oturumBiter: biter.toISOString(),
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    console.error("giris başarısız:", (e as Error).message);
    return NextResponse.json(
      { hata: "Giriş yapılamadı" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
