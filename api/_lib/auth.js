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
    RETURNING o.id, o.biter, y.id AS yonetici_id, y.kullanici_adi
  `;

  return satirlar[0] ?? null;
}

/** Süresi geçmiş oturumları temizler. Fırsat buldukça çağrılır; hata
    verirse yutulur — temizlik, isteğin başarısına engel olmamalı. */
export async function eskiOturumlariTemizle(sql) {
  try {
    await sql`DELETE FROM oturumlar WHERE biter < now() - interval '1 day'`;
  } catch { /* önemsiz */ }
}

/* ---------------- hız sınırı ---------------- */

export const PENCERE_DK = 15;
export const SINIR = 5;

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
