/* =====================================================================
   POST /api/sifre-degistir   { mevcutSifre, yeniSifre }

   Oturum zorunlu. Kimlik katmanına ait bir uç — ürün/fiyat verisine
   dokunmuyor, yalnızca yoneticiler ve oturumlar tablolarını yazıyor.

   Başarılı değişimden sonra kullanıcının BÜTÜN oturumları siliniyor ve
   çağırana yepyeni bir jeton veriliyor. İki nedenle:
     - Şifre değişiminin amacı, eskiyi bilen birinin erişimini kesmek.
       Diğer cihazlardaki oturumlar açık kalırsa bu amaç boşa çıkar.
     - Oturum sabitlemesi (session fixation): jeton yenilenmezse,
       değişim öncesinde jetonu ele geçirmiş biri erişimini sürdürür.
   ===================================================================== */

import {
  sqlAl, oturumDogrula, parolaDogrula, parolaHashle, oturumAc,
  cerezYaz, onbelleksiz, metodKontrol, istemciIp,
  basarisizDenemeSayisi, denemeKaydet,
  ASGARI_PAROLA, SINIR, PENCERE_DK,
} from './_lib/auth.js';

export default async function handler(req, res) {
  onbelleksiz(res);
  if (!metodKontrol(req, res, 'POST')) return;

  const tur = String(req.headers['content-type'] ?? '');
  if (!tur.toLowerCase().includes('application/json')) {
    return res.status(415).json({ hata: 'Content-Type application/json olmalı' });
  }

  let sql;
  try { sql = sqlAl(); }
  catch { return res.status(500).json({ hata: 'Sunucu yapılandırması eksik' }); }

  const ip = istemciIp(req);

  try {
    const oturum = await oturumDogrula(req);
    if (!oturum) return res.status(401).json({ hata: 'Oturum gerekli' });

    // Mevcut şifre de bir parola denemesi; aynı hız sınırına tabi.
    if (await basarisizDenemeSayisi(sql, ip) >= SINIR) {
      return res.status(429).json({
        hata: `Çok fazla başarısız deneme. ${PENCERE_DK} dakika sonra tekrar deneyin.`,
      });
    }

    let govde = req.body;
    if (typeof govde === 'string') {
      try { govde = JSON.parse(govde); } catch { govde = null; }
    }
    const mevcutSifre = govde?.mevcutSifre;
    const yeniSifre = govde?.yeniSifre;

    if (typeof mevcutSifre !== 'string' || typeof yeniSifre !== 'string' ||
        !mevcutSifre || !yeniSifre) {
      return res.status(400).json({ hata: 'mevcutSifre ve yeniSifre gerekli' });
    }

    const kayitlar = await sql`
      SELECT id, kullanici_adi, parola_hash
        FROM yoneticiler
       WHERE id = ${oturum.yonetici_id}
       LIMIT 1
    `;
    const yonetici = kayitlar[0];
    if (!yonetici) return res.status(401).json({ hata: 'Oturum gerekli' });

    if (!(await parolaDogrula(mevcutSifre, yonetici.parola_hash))) {
      await denemeKaydet(sql, ip, false);
      return res.status(401).json({ hata: 'Mevcut şifre hatalı' });
    }

    // --- yeni şifre kuralları (asıl kontrol burada; istemcideki yalnızca kolaylık)
    if (yeniSifre.length < ASGARI_PAROLA) {
      return res.status(400).json({ hata: `Yeni şifre en az ${ASGARI_PAROLA} karakter olmalı` });
    }
    if (yeniSifre === mevcutSifre) {
      return res.status(400).json({ hata: 'Yeni şifre mevcut şifreyle aynı olamaz' });
    }

    const yeniHash = await parolaHashle(yeniSifre);

    await sql`
      UPDATE yoneticiler
         SET parola_hash = ${yeniHash}, sifre_degistirmeli = false
       WHERE id = ${yonetici.id}
    `;

    // Bütün oturumları kes, sonra çağırana taze bir tane ver
    await sql`DELETE FROM oturumlar WHERE yonetici_id = ${yonetici.id}`;
    const { jeton, biter } = await oturumAc(sql, yonetici.id);

    await denemeKaydet(sql, ip, true);
    cerezYaz(res, jeton);

    return res.status(200).json({
      degisti: true,
      kullaniciAdi: yonetici.kullanici_adi,
      sifreDegistirmeli: false,
      oturumBiter: biter.toISOString(),
    });
  } catch (e) {
    console.error('sifre-degistir başarısız:', e.message);
    return res.status(500).json({ hata: 'Şifre değiştirilemedi' });
  }
}
