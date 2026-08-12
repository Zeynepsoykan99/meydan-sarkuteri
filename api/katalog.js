/* =====================================================================
   GET /api/katalog

   Yanıt, data/products.json ile BİREBİR aynı şekildedir:
     { guncellendi, reyonlar: [...], urunler: [...] }
   Amaç: js/app.js'in tek satırı bile değişmesin. Veri kaynağı dosya da
   olsa veritabanı da olsa arayüz aynı yükü görür.

   Yalnızca okuma. Yazma ucu YOK — kimlik doğrulama kurulmadan korumasız
   bir POST/PUT/DELETE yayına giderse katalogu herkes değiştirebilir.
   ===================================================================== */

import { neon } from '@neondatabase/serverless';

/* Önbellek süreleri
   s-maxage=60           CDN yanıtı 60 sn taze tutar. Panelden yapılan bir
                         fiyat düzeltmesi en geç bir dakikada görünür —
                         katalog için yeterince hızlı, veritabanını her
                         ziyaretçide dövmeyecek kadar da uzun.
   stale-while-revalidate=600
                         Süre dolduktan sonraki 10 dakika boyunca CDN
                         bayat yanıtı ANINDA verir, tazelemeyi arkada
                         yapar. Böylece soğuk veritabanı ya da anlık bir
                         Neon yavaşlaması kullanıcıyı bekletmez; en kötü
                         ihtimalle bir dakikalık eski fiyat görür.
   Yazma ucu eklendiğinde bu süreler yeniden düşünülmeli: anında
   yansıması gereken bir düzenleme akışı varsa etiket tabanlı geçersiz
   kılma (cache tag) daha doğru olur. */
const ONBELLEK = 'public, s-maxage=60, stale-while-revalidate=600';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({
      hata: 'Yalnızca GET destekleniyor',
      metod: req.method,
    });
  }

  if (!process.env.DATABASE_URL) {
    // Yapılandırma eksikse bunu 500 olarak söyle; app.js dosya yedeğine düşer
    return res.status(500).json({ hata: 'DATABASE_URL tanımlı değil' });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);

    const [reyonlar, urunler, damga] = await Promise.all([
      // "adet" YOK: reyon başına ürün sayısı arayüzde hesaplanıyor,
      // böylece sayaçla gerçek sayı ayrışamıyor.
      sql`SELECT id, ad, ikon
          FROM reyonlar
          ORDER BY sira NULLS LAST, id`,

      sql`SELECT id, ad, reyon, gorsel, fiyat, eski_fiyat, miktar, birim, stokta, kaynak
          FROM urunler
          ORDER BY id`,

      sql`SELECT max(guncellendi) AS en_son FROM urunler`,
    ]);

    // numeric sütunlar sürücüden string gelir; JSON'daki gibi sayı olmalı
    const sayi = (v) => (v === null || v === undefined ? null : Number(v));

    res.setHeader('Cache-Control', ONBELLEK);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    return res.status(200).json({
      guncellendi: damga[0]?.en_son ?? null,
      reyonlar,
      urunler: urunler.map((u) => ({
        id: u.id,
        ad: u.ad,
        reyon: u.reyon,
        gorsel: u.gorsel,
        fiyat: sayi(u.fiyat),
        eskiFiyat: sayi(u.eski_fiyat),   // veritabanında snake_case, yükte camelCase
        kaynak: u.kaynak,
        miktar: sayi(u.miktar),
        birim: u.birim,
        stokta: u.stokta,
      })),
    });
  } catch (e) {
    // Ayrıntıyı sunucu günlüğüne bırak, dışarıya sızdırma
    console.error('katalog sorgusu başarısız:', e);
    return res.status(500).json({ hata: 'Katalog okunamadı' });
  }
}
