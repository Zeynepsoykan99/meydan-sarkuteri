import {
  randomBytes, scrypt, timingSafeEqual, createHash,
} from "node:crypto";
import { cookies, headers } from "next/headers";
import { sqlAl } from "./veritabani";

function scryptSoz(
  parola: string,
  salt: Buffer,
  keylen: number,
  ayar: { N: number; r: number; p: number }
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(
      parola,
      salt,
      keylen,
      { N: ayar.N, r: ayar.r, p: ayar.p, maxmem: 256 * 1024 * 1024 },
      (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey as Buffer);
      }
    );
  });
}

export const CEREZ_ADI = "oturum";
export const OTURUM_GUN = 30;
export const ASGARI_PAROLA = 12;

const N = 16384;
const r = 8;
const p = 1;
const ANAHTAR_UZUNLUK = 64;

export async function parolaHashle(parola: string, ayar = { N, r, p }): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptSoz(parola, salt, ANAHTAR_UZUNLUK, ayar);
  return ["scrypt", ayar.N, ayar.r, ayar.p,
          salt.toString("base64"), hash.toString("base64")].join("$");
}

export const SAHTE_HASH =
  "scrypt$16384$8$1$iibxpvCHFmtmwoqAxLy7zQ==$" +
  "n4kH0zto2FU/Om9x9fiq0vifTUiA8+bnbWROQSp8NGw7FDJoxL6cVAjaAEJc5ihWFFqf0YVYYQjaT7/r/Z0Lrg==";

export async function parolaDogrula(parola: string, saklanan: string): Promise<boolean> {
  try {
    const [alg, sN, sr, sp, saltB64, hashB64] = String(saklanan).split("$");
    if (alg !== "scrypt") return false;

    const salt = Buffer.from(saltB64, "base64");
    const beklenen = Buffer.from(hashB64, "base64");

    const uretilen = await scryptSoz(parola, salt, beklenen.length, {
      N: Number(sN),
      r: Number(sr),
      p: Number(sp),
    });

    // Asla === kullanma: uzunluk farkı da içerik farkı da zamana sızar
    if (uretilen.length !== beklenen.length) return false;
    return timingSafeEqual(uretilen, beklenen);
  } catch {
    return false;
  }
}

export function jetonUret(): string {
  return randomBytes(32).toString("base64url");
}

export function jetonOzeti(jeton: string): string {
  return createHash("sha256").update(jeton).digest("hex");
}

export type OturumBilgisi = {
  id: string;
  biter: Date;
  yonetici_id: string;
  kullanici_adi: string;
  sifre_degistirmeli: boolean;
};

/** Mevcut çerezdeki jetonu doğrulayıp oturumu döndürür, yoksa null. */
export async function oturumDogrula(ozelJeton?: string | null): Promise<OturumBilgisi | null> {
  let jeton = ozelJeton;
  if (!jeton) {
    const c = await cookies();
    jeton = c.get(CEREZ_ADI)?.value ?? null;
  }
  if (!jeton) return null;

  try {
    const sql = sqlAl();
    const ozet = jetonOzeti(jeton);

    const satirlar = await sql`
      UPDATE oturumlar o
         SET son_kullanim = now()
        FROM yoneticiler y
       WHERE o.token_hash = ${ozet}
         AND o.yonetici_id = y.id
         AND o.biter > now()
      RETURNING o.id, o.biter, y.id AS yonetici_id, y.kullanici_adi,
                y.sifre_degistirmeli
    `;

    return (satirlar[0] as OturumBilgisi) ?? null;
  } catch {
    return null;
  }
}

/** Yeni oturum oluşturup ham jetonu döner. */
export async function oturumAc(yoneticiId: string) {
  const sql = sqlAl();
  const jeton = jetonUret();
  const biter = new Date(Date.now() + OTURUM_GUN * 24 * 60 * 60 * 1000);
  await sql`
    INSERT INTO oturumlar (token_hash, yonetici_id, biter)
    VALUES (${jetonOzeti(jeton)}, ${yoneticiId}, ${biter.toISOString()})
  `;
  return { jeton, biter };
}

export const BAKIM_OLASILIGI = 0.02; // ~%2
export const DENEME_SAKLAMA_GUN = 30;

export function bakimZamaniMi(): boolean {
  return Math.random() < BAKIM_OLASILIGI;
}

export async function bakimYap() {
  const sonuc = { denemeler: 0, oturumlar: 0, hata: null as string | null };
  try {
    const sql = sqlAl();
    const d = await sql`
      DELETE FROM giris_denemeleri
       WHERE zaman < now() - (${DENEME_SAKLAMA_GUN} * interval '1 day')
      RETURNING id`;
    sonuc.denemeler = d.length;

    const o = await sql`
      DELETE FROM oturumlar
       WHERE biter < now() - interval '1 day'
      RETURNING id`;
    sonuc.oturumlar = o.length;

    if (sonuc.denemeler > 0 || sonuc.oturumlar > 0) {
      console.log(`[BAKIM] Temizlik tamamlandı: ${sonuc.denemeler} eski deneme, ${sonuc.oturumlar} süresi geçmiş oturum silindi.`);
    }
  } catch (e) {
    sonuc.hata = (e as Error).message;
    console.error("[BAKIM] Bakım işlemi başarısız (yok sayıldı):", (e as Error).message);
  }
  return sonuc;
}

export const PENCERE_DK = 15;
export const SINIR = 5;

/* X-Forwarded-For'un EN SOLDAKİ değerini okuyoruz.
 *
 * Genel kural olarak bu güvensizdir: çoğu proxy istemcinin gönderdiği
 * başlığın sağına kendi gördüğü IP'yi ekler, dolayısıyla en soldaki
 * değer istemcinin uydurduğu şey olur ve IP başına hız sınırı
 * atlanabilir hale gelir.
 *
 * Vercel'de durum farklı: platform gelen X-Forwarded-For başlığını
 * EZİYOR, listeye eklemiyor. 14 Ağustos 2026'da hem preview hem
 * production üzerinde ölçüldü — her istekte farklı sahte bir
 * X-Forwarded-For (1.2.3.1 … 1.2.3.10) gönderildi; fonksiyona her
 * seferinde tek değer olarak gerçek istemci IP'si ulaştı, sahte
 * değerlerin hiçbiri ne log'a ne giris_denemeleri tablosuna düştü,
 * ve hız sınırı 6. denemede yine 429 verdi.
 * x-real-ip ve x-vercel-forwarded-for da aynı gerçek IP'yi taşıyor.
 *
 * YEDEK KAYNAK DEĞİŞTİ — Next taşımasında. Kök projede yedek
 * req.socket.remoteAddress idi: TCP bağlantısının kendi adresi, yani
 * istemcinin UYDURAMAYACAĞI bir değer. App Router'da ham sokete erişim
 * yok, bu yüzden yedek artık x-real-ip BAŞLIĞI. Aradaki fark güvenlik
 * açısından önemli: x-real-ip de tıpkı x-forwarded-for gibi istemcinin
 * kendi gönderebileceği sıradan bir başlık. Platform onu ezmiyorsa
 * saldırgan her istekte farklı bir x-real-ip yollayarak IP başına hız
 * sınırını tamamen atlayabilir. Bugün Vercel eziyor, o yüzden güvenli
 * — ama güvenlik tümüyle platform davranışına bağlı, kodun kendi
 * güvencesi değil.
 *
 * DİKKAT: Uygulama başka bir proxy arkasına taşınır ya da doğrudan
 * internete açılırsa bu fonksiyon yeniden değerlendirilmeli — o durumda
 * en SAĞDAKİ değeri almak ya da proxy'nin kendi ürettiği güvenilir
 * başlığa geçmek gerekir. Yedeğin artık başlık olması, o senaryoda bu
 * sürümü soket adresli özgün sürümden DAHA riskli yapıyor.
 */
export async function istemciIp(): Promise<string> {
  const h = await headers();
  const iletilen = h.get("x-forwarded-for");
  if (iletilen && iletilen.length) {
    return iletilen.split(",")[0].trim();
  }
  return h.get("x-real-ip") ?? "bilinmiyor";
}

export async function basarisizDenemeSayisi(ip: string): Promise<number> {
  const sql = sqlAl();
  const [{ adet }] = await sql`
    SELECT count(*)::int AS adet
      FROM giris_denemeleri
     WHERE ip = ${ip}
       AND NOT basarili
       AND zaman > now() - (${PENCERE_DK} * interval '1 minute')
  `;
  return adet;
}

export async function denemeKaydet(ip: string, basarili: boolean) {
  try {
    const sql = sqlAl();
    await sql`INSERT INTO giris_denemeleri (ip, basarili) VALUES (${ip}, ${basarili})`;
  } catch {
    /* loglama hatası akışı bozmasın */
  }
}
