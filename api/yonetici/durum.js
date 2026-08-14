/* =====================================================================
   GET /api/yonetici/durum   — KORUMALI

   Tek amacı korumanın çalıştığını kanıtlamak. Oturum yoksa 401.

   Burada ürün/fiyat DEĞİŞTİREN hiçbir şey yok ve bilerek yok: yazma
   uçları auth doğrulandıktan sonraki adımda gelecek. Bu uç yalnızca
   okur.
   ===================================================================== */

import { sqlAl, oturumDogrula, onbelleksiz, metodKontrol } from '../_lib/auth.js';

export default async function handler(req, res) {
  onbelleksiz(res);
  if (!metodKontrol(req, res, 'GET')) return;

  try {
    const oturum = await oturumDogrula(req);
    if (!oturum) return res.status(401).json({ hata: 'Oturum gerekli' });

    const sql = sqlAl();
    const [{ adet }] = await sql`SELECT count(*)::int AS adet FROM urunler`;

    return res.status(200).json({
      kullaniciAdi: oturum.kullanici_adi,
      oturumBiter: oturum.biter,
      urunSayisi: adet,
    });
  } catch (e) {
    console.error('yonetici/durum başarısız:', e.message);
    return res.status(500).json({ hata: 'Durum okunamadı' });
  }
}
