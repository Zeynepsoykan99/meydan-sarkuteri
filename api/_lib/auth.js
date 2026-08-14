/* =====================================================================
   Kimlik doğrulama yardımcıları.

   Dosya adı alt çizgiyle başlayan dizinde: Vercel api/ altında alt
   çizgiyle başlayan dosya ve dizinleri Serverless Function'a çevirmez.
   Bu, "vercel build" çıktısı incelenerek doğrulandı — .vercel/output/
   functions/api/ altında yalnızca gerçek uçlar oluşuyor, _lib oluşmuyor.

   Yeni bağımlılık yok: her şey node:crypto ile.

   Bu dosya YALNIZCA kimlik doğrulama yapar. Ürün/fiyat yazma yardımcısı
   bilerek yok.
   ===================================================================== */

import {
  randomBytes, scrypt, timingSafeEqual, createHash,
} from 'node:crypto';
import { promisify } from 'node:util';
import { neon } from '@neondatabase/serverless';

const scryptAsync = promisify(scrypt);

export const CEREZ_ADI = 'oturum';
export const OTURUM_GUN = 30;
export const ASGARI_PAROLA = 12;

/* ---------------- parola ----------------
   scrypt: bellek-zorlu, GPU ile kaba kuvvete karşı bcrypt'ten dirençli.
   Parametreler hash'in içinde saklanıyor ki maliyet ileride artırılınca
   eski kayıtlar hâlâ doğrulanabilsin. */

const N = 16384;   // CPU/bellek maliyeti
const r = 8;       // blok boyutu
const p = 1;       // paralellik
const ANAHTAR_UZUNLUK = 64;

export async function parolaHashle(parola, ayar = { N, r, p }) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(parola, salt, ANAHTAR_UZUNLUK, {
    N: ayar.N, r: ayar.r, p: ayar.p, maxmem: 256 * 1024 * 1024,
  });
  return ['scrypt', ayar.N, ayar.r, ayar.p,
          salt.toString('base64'), hash.toString('base64')].join('$');
}

// Kullanıcı bulunamadığında da bir doğrulama yapıp yanıt süresini
// eşitlemek için. Gerçek bir scrypt çıktısı — üretilirken kullanılan
// rastgele girdi atıldı, yani karşılık geldiği bir parola yok.
// Aynı parametrelerle üretildi ki sahte doğrulama gerçeğiyle aynı sürsün.
export const SAHTE_HASH =
  'scrypt$16384$8$1$iibxpvCHFmtmwoqAxLy7zQ==$' +
  'n4kH0zto2FU/Om9x9fiq0vifTUiA8+bnbWROQSp8NGw7FDJoxL6cVAjaAEJc5ihWFFqf0YVYYQjaT7/r/Z0Lrg==';

export async function parolaDogrula(parola, saklanan) {
  try {
    const [alg, sN, sr, sp, saltB64, hashB64] = String(saklanan).split('$');
    if (alg !== 'scrypt') return false;

    const salt = Buffer.from(saltB64, 'base64');
    const beklenen = Buffer.from(hashB64, 'base64');

    const uretilen = await scryptAsync(parola, salt, beklenen.length, {
      N: Number(sN), r: Number(sr), p: Number(sp), maxmem: 256 * 1024 * 1024,
    });

    // Asla === kullanma: uzunluk farkı da içerik farkı da zamana sızar
    if (uretilen.length !== beklenen.length) return false;
    return timingSafeEqual(uretilen, beklenen);
  } catch {
    return false;
  }
}

/* ---------------- oturum jetonu ----------------
   Ham jeton yalnızca çereze gider. Veritabanına SHA-256 özeti yazılır;
   veritabanı sızsa bile özetten jeton üretilemez. */

export function jetonUret() {
  return randomBytes(32).toString('base64url');
}

export function jetonOzeti(jeton) {
  return createHash('sha256').update(jeton).digest('hex');
}

/* ---------------- çerez ---------------- */

export function cerezOku(req, ad = CEREZ_ADI) {
  // Vercel çalışma zamanı req.cookies veriyor; yoksa elle ayrıştır.
  if (req.cookies && typeof req.cookies === 'object' && req.cookies[ad]) {
    return req.cookies[ad];
  }
  const ham = req.headers?.cookie;
  if (!ham) return null;
  for (const parca of ham.split(';')) {
    const esit = parca.indexOf('=');
    if (esit === -1) continue;
    if (parca.slice(0, esit).trim() === ad) {
      return decodeURIComponent(parca.slice(esit + 1).trim());
    }
  }
  return null;
}

export function cerezYaz(res, jeton) {
  const saniye = OTURUM_GUN * 24 * 60 * 60;
  res.setHeader('Set-Cookie',
    `${CEREZ_ADI}=${jeton}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${saniye}`);
}

export function cerezSil(res) {
  res.setHeader('Set-Cookie',
    `${CEREZ_ADI}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);
}

/* ---------------- veritabanı ---------------- */

export function sqlAl() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL tanımlı değil');
  return neon(url);
}

/* ---------------- oturum doğrulama ---------------- */

/** Geçerli oturumu döndürür, yoksa null. son_kullanim'ı tazeler. */
export async function oturumDogrula(req) {
  const jeton = cerezOku(req);
  if (!jeton) return null;

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

  return satirlar[0] ?? null;
}

/** Kullanıcıya yeni bir oturum açar ve ham jetonu döndürür.
    Ham jeton yalnızca çağırana verilir; veritabanına özeti gider. */
export async function oturumAc(sql, yoneticiId) {
  const jeton = jetonUret();
  const biter = new Date(Date.now() + OTURUM_GUN * 24 * 60 * 60 * 1000);
  await sql`
    INSERT INTO oturumlar (token_hash, yonetici_id, biter)
    VALUES (${jetonOzeti(jeton)}, ${yoneticiId}, ${biter.toISOString()})
  `;
  return { jeton, biter };
}

/* ---------------- bakım ----------------
   İki tablo sınırsız büyüyor: giris_denemeleri her denemede satır
   ekliyor, oturumlar süresi dolmuş kayıtları tutuyor. Ayrı bir
   zamanlayıcı kurmak yerine giriş ucunda düşük olasılıkla tetikliyoruz.

   Neden await ediliyor: fire-and-forget bırakılsa serverless fonksiyon
   yanıtı döndürüp donduğunda silme yarıda kalabilir. Bunun yerine
   olasılığı düşük tutuyoruz — ortalama ek gecikme, 100 girişte 2 kez
   ~50 ms, yani istek başına ~1 ms. Pratikte ölçülemez.

   Hata yutuluyor: bakım patlarsa giriş patlamamalı. */

export const BAKIM_OLASILIGI = 0.02;      // ~%2
export const DENEME_SAKLAMA_GUN = 30;

export function bakimZamaniMi() {
  return Math.random() < BAKIM_OLASILIGI;
}

/** 30 günden eski giriş denemelerini ve süresi geçmiş oturumları siler.
    Test edilebilmesi için dışa açık; normalde bakimZamaniMi() ile
    çağrılır. Silinen satır sayılarını döndürür. */
export async function bakimYap(sql) {
  const sonuc = { denemeler: 0, oturumlar: 0, hata: null };
  try {
    const d = await sql`
      DELETE FROM giris_denemeleri
       WHERE zaman < now() - (${DENEME_SAKLAMA_GUN} * interval '1 day')
      RETURNING id`;
    sonuc.denemeler = d.length;

    // Süresi dolan oturuma bir gün tolerans: hemen silmek yerine
    // bekletmek, saat kaymalarında beklenmedik çıkışları önlüyor.
    const o = await sql`
      DELETE FROM oturumlar
       WHERE biter < now() - interval '1 day'
      RETURNING id`;
    sonuc.oturumlar = o.length;
  } catch (e) {
    sonuc.hata = e.message;
    console.error('bakım başarısız (yok sayıldı):', e.message);
  }
  return sonuc;
}

/* ---------------- hız sınırı ---------------- */

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
 * DİKKAT: Bu güvenlik platform davranışına bağlı. Uygulama başka bir
 * proxy arkasına taşınır ya da doğrudan internete açılırsa bu satır
 * yeniden değerlendirilmeli — o durumda en SAĞDAKİ değeri almak ya da
 * proxy'nin kendi ürettiği başlığa geçmek gerekir.
 *
 * req.socket.remoteAddress kullanılamıyor: Vercel'de her zaman
 * 127.0.0.1 dönüyor (fonksiyon proxy'nin arkasında).
 */
export function istemciIp(req) {
  const iletilen = req.headers?.['x-forwarded-for'];
  if (typeof iletilen === 'string' && iletilen.length) {
    return iletilen.split(',')[0].trim();
  }
  return req.socket?.remoteAddress ?? 'bilinmiyor';
}

/** Son PENCERE_DK dakikada bu IP'den kaç başarısız deneme var. */
export async function basarisizDenemeSayisi(sql, ip) {
  const [{ adet }] = await sql`
    SELECT count(*)::int AS adet
      FROM giris_denemeleri
     WHERE ip = ${ip}
       AND NOT basarili
       AND zaman > now() - (${PENCERE_DK} * interval '1 minute')
  `;
  return adet;
}

export async function denemeKaydet(sql, ip, basarili) {
  try {
    await sql`INSERT INTO giris_denemeleri (ip, basarili) VALUES (${ip}, ${basarili})`;
  } catch { /* kayıt tutulamadıysa giriş akışı yine de sürsün */ }
}

/* ---------------- ortak yanıt yardımcıları ---------------- */

/** Kimlik uçları asla önbelleklenmemeli — ne CDN'de ne tarayıcıda. */
export function onbelleksiz(res) {
  res.setHeader('Cache-Control', 'no-store');
}

export function metodKontrol(req, res, izinli) {
  if (req.method === izinli) return true;
  res.setHeader('Allow', izinli);
  onbelleksiz(res);
  res.status(405).json({ hata: `Yalnızca ${izinli} destekleniyor`, metod: req.method });
  return false;
}
