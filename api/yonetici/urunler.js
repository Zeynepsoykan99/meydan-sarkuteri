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

import { readFileSync } from 'node:fs';
import { sqlAl, oturumDogrula, onbelleksiz, metodKontrol } from '../_lib/auth.js';
import { urunYuku } from '../_lib/urun.js';

/* Yedek dosyasının damgası.

   data/products.json elle alınıyor (npm run yedek-al) ve sessizce
   eskiyebiliyor; site bir arıza sırasında ona düşünce eski fiyat
   gösterir. Panel bunu söyleyebilsin diye damgayı buradan veriyoruz —
   ayrı bir uç açmaya değmez.

   Dosya okunamazsa null: panel şeridi hiç göstermiyor. Yedeğin
   durumunu bilememek, yanlış bilmekten iyidir. */
function yedekDamgasiOku() {
  try {
    const yol = new URL('../../data/products.json', import.meta.url);
    const veri = JSON.parse(readFileSync(yol, 'utf8'));
    return typeof veri.guncellendi === 'string' ? veri.guncellendi : null;
  } catch {
    return null;
  }
}

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
      yedekDamgasi: yedekDamgasiOku(),
      reyonlar,
      urunler: urunler.map((u) => urunYuku(u, true)),
    });
  } catch (e) {
    console.error('yonetici/urunler başarısız:', e.message);
    return res.status(500).json({ hata: 'Ürünler okunamadı' });
  }
}
