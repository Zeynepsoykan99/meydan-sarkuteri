import { NextResponse } from "next/server";
import { connection } from "next/server";
import { sqlAl } from "@/lib/veritabani";
import { dukkanGetir } from "@/lib/dukkan";
import anlik from "@/katalog-anlik.json";

/* =====================================================================
   Sistem Sağlık ve Canlılık Kontrol Ucu (Health Check)
   GET /api/saglik

   KULLANIM AMAÇLARI:
   1. Harici izleme (UptimeRobot, BetterStack, Vercel Cron):
      5-10 dakikada bir çağrılarak hem sistemin 7/24 ayakta olduğunu doğrular
      hem de Neon Serverless Postgres'in uykuya geçmesini (cold start) engeller.
   2. Canlı Durum Teşhisi: Veritabanı gecikme süresini (ms), anlık yedek
      tazeliğini, toplam ürün sayısını ve dükkân açık/kapalı durumunu raporlar.
   ===================================================================== */

export async function GET() {
  await connection();
  const baslangic = Date.now();

  let dbBagli = false;
  let dbGecikmeMs = 0;
  let urunSayisi = anlik.urunler?.length ?? 0;
  let sonGuncelleme: string | null = anlik.guncellendi ?? null;
  /* Hata metni YANITA KONMUYOR: bu uç kimlik istemiyor, sürücü hataları
     bağlantı adresi/kullanıcı adı içerebiliyor. Yalnızca günlüğe yazılır. */
  let dbHata: string | null = null;

  try {
    const dbBaslangic = Date.now();
    const sql = sqlAl();
    const [pingSonucu, sayimSonucu, damgaSonucu] = await Promise.all([
      sql`SELECT 1 AS ping`,
      sql`SELECT count(*)::int AS adet FROM urunler`,
      sql`SELECT max(guncellendi) AS en_son FROM urunler`,
    ]);

    dbGecikmeMs = Date.now() - dbBaslangic;
    if (pingSonucu && pingSonucu.length > 0) {
      dbBagli = true;
      urunSayisi = sayimSonucu[0]?.adet ?? urunSayisi;
      sonGuncelleme = (damgaSonucu[0]?.en_son as Date | null)?.toISOString() ?? sonGuncelleme;
    }
  } catch (e) {
    dbHata = (e as Error).message;
    console.error("[SAĞLIK] Veritabanı sorgusu başarısız:", dbHata);
  }

  let dukkanBilgisi: { dolduruldu: boolean; ad?: string } | null = null;
  try {
    const d = await dukkanGetir();
    if (d) {
      dukkanBilgisi = { dolduruldu: d.dolduruldu ?? false, ad: d.ad };
    }
  } catch {
    // dükkan bilgisi okunamazsa sessizce geç
  }

  const toplamSureMs = Date.now() - baslangic;
  const saglikli = dbBagli;

  const rapor = {
    durum: saglikli ? "saglikli" : "kısmi (yedekten besleniyor)",
    zaman: new Date().toISOString(),
    toplamSureMs,
    veritabani: {
      bagli: dbBagli,
      gecikmeMs: dbGecikmeMs,
      urunSayisi,
      sonGuncelleme,
    },
    anlikYedek: {
      mevcut: Boolean(anlik.urunler?.length),
      urunSayisi: anlik.urunler?.length ?? 0,
      damga: anlik.guncellendi ?? null,
      alindi: anlik.alindi ?? null,
    },
    dukkan: dukkanBilgisi,
    surum: "Next.js 16.2.12 (PPR)",
  };

  return NextResponse.json(rapor, {
    status: saglikli ? 200 : 200, // Yedekten servis verebildiğimiz için 200 döner, rapor içinde 'kısmi' belirtilir
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
