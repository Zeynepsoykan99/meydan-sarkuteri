import { cacheLife } from "next/cache";
import dukkanVerisi from "../data/dukkan.json";
import type { Dukkan } from "./tipler";

/* Dükkân bilgisi. Saat mantığı lib/saat.ts'te — orada next/* bağımlılığı
   yok, sınamalar doğrudan import edebiliyor. */

export * from "./saat";

/* NEDEN readFile DEĞİL import:

   Önceden dosya `readFile(join(process.cwd(), ...))` ile okunuyordu ve iki
   yol deneniyordu (nextjs/data/, sonra ../data/). Bu desenin iki ayrı
   kırılma noktası vardı ve ikisi de SESSİZ:

   1. Derleme zamanı — Vercel'de Root Directory nextjs olduğunda üst dizine
      erişim kısıtlanıyor ("the application cannot access files outside of
      the specified directory"). Prebuild'in kökten kopyalaması başarısız
      olursa iki yol da tutmaz.
   2. Çalışma zamanı — asıl sinsi olan. process.cwd() ile kurulan yolları
      Next'in dosya izleyicisi (NFT) statik olarak İZLEYEMEZ. Prerender
      derlemede çalıştığı için ilk istek sorunsuz gelir; ama cacheLife
      ("minutes") dolup yenileme serverless fonksiyonun içinde koştuğunda
      dosya o pakete kopyalanmamış olabilir.

   Her iki durumda da dukkanGetir() null döner ve dükkân bölümü, üstteki
   şerit ve altbilgi bilgisi HATA VERMEDEN kaybolur.

   Modül olarak import edilince ikisi de ortadan kalkıyor: JSON derleme
   zamanında paketin içine giriyor, ne üst dizin erişimi ne NFT izlemesi
   gerekiyor, çalışma zamanında da garanti mevcut. katalog-anlik.json ve
   urun-kimlikleri.json zaten bu desenle okunuyor.

   Tek doğruluk kaynağı hâlâ depo kökündeki data/dukkan.json; buradaki
   nextjs/data/dukkan.json onun prebuild tarafından tazelenen kopyası.
   İkisinin ayrışmasını tests/dukkan.mjs denetliyor. */
export async function dukkanGetir(): Promise<Dukkan | null> {
  "use cache";
  cacheLife("minutes");

  const veri = dukkanVerisi as Dukkan;
  if (!veri || typeof veri !== "object") return null;
  if (veri.dolduruldu !== true) return null;   // bayrak kapalı: hiç gösterme
  return veri;
}
