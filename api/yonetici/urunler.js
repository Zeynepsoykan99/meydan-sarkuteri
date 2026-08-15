/* =====================================================================
   GET /api/yonetici/urunler   — KORUMALI

   Panelin okuma ucu. /api/katalog ile aynı veriyi verir ama:
     - oturum ister
     - no-store döner

   Neden ayrı bir uç: /api/katalog CDN'de 60 saniye önbellekleniyor
   (halka açık site için doğru). Panel onu okusaydı, sahibi bir fiyatı
   düzenledikten sonra kendi değişikliğini bir dakikaya kadar
   göremeyebilirdi. Burada önbellek yok.

   Yalnızca okur. Yazma PATCH /api/yonetici/urun'de.
   ===================================================================== */

import { sqlAl, oturumDogrula, onbelleksiz, metodKontrol } from '../_lib/auth.js';
import { urunYuku } from '../_lib/urun.js';

export default async function handler(req, res) {
  onbelleksiz(res);
  if (!metodKontrol(req, res, 'GET')) return;

  try {
    const oturum = await oturumDogrula(req);
    if (!oturum) return res.status(401).json({ hata: 'Oturum gerekli' });

    const sql = sqlAl();
    const [reyonlar, urunler, damga] = await Promise.all([
      sql`SELECT id, ad, ikon FROM reyonlar ORDER BY sira NULLS LAST, id`,
      sql`SELECT id, ad, reyon, gorsel, fiyat, eski_fiyat, miktar, birim,
                 stokta, kaynak, guncellendi
            FROM urunler ORDER BY id`,
      sql`SELECT max(guncellendi) AS en_son FROM urunler`,
    ]);

    return res.status(200).json({
      guncellendi: damga[0]?.en_son ?? null,
      reyonlar,
      urunler: urunler.map((u) => urunYuku(u, true)),
    });
  } catch (e) {
    console.error('yonetici/urunler başarısız:', e.message);
    return res.status(500).json({ hata: 'Ürünler okunamadı' });
  }
}
