/* =====================================================================
   GET /api/oturum

   Durum sorgusu: oturum var mı, yok mu. Oturum yoksa da 200 döner —
   401 DEĞİL. Bu uç "yetkin var mı" diye sormuyor, "ne durumdayım" diye
   soruyor; arayüz bunu çağırıp giriş düğmesi mi çıkış düğmesi mi
   göstereceğine karar edebilsin diye var.
   ===================================================================== */

import { oturumDogrula, onbelleksiz, metodKontrol } from './_lib/auth.js';

export default async function handler(req, res) {
  onbelleksiz(res);
  if (!metodKontrol(req, res, 'GET')) return;

  try {
    const oturum = await oturumDogrula(req);
    if (!oturum) return res.status(200).json({ girisli: false });

    return res.status(200).json({
      girisli: true,
      kullaniciAdi: oturum.kullanici_adi,
    });
  } catch (e) {
    console.error('oturum sorgusu başarısız:', e.message);
    // Durum bilinemiyorsa "girişli değil" demek güvenli taraf
    return res.status(200).json({ girisli: false });
  }
}
