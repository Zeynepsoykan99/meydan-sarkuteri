/* =====================================================================
   POST /api/cikis

   Oturumu veritabanından siler ve çerezi temizler.
   Oturum yoksa da 200 döner: "böyle bir oturum yoktu" bilgisi bile
   sızdırılmaz, ve çıkış işlemi her durumda başarılı sayılmalı.
   ===================================================================== */

import {
  sqlAl, cerezOku, cerezSil, jetonOzeti, onbelleksiz, metodKontrol,
} from './_lib/auth.js';

export default async function handler(req, res) {
  onbelleksiz(res);
  if (!metodKontrol(req, res, 'POST')) return;

  const jeton = cerezOku(req);

  if (jeton) {
    try {
      const sql = sqlAl();
      await sql`DELETE FROM oturumlar WHERE token_hash = ${jetonOzeti(jeton)}`;
    } catch (e) {
      // Silinemese bile çerezi temizleyip 200 dönüyoruz: tarayıcı tarafı
      // her hâlükârda çıkmış olsun. Sunucudaki kayıt süresi dolunca gider.
      console.error('cikis: oturum silinemedi:', e.message);
    }
  }

  cerezSil(res);
  return res.status(200).json({ girisli: false });
}
