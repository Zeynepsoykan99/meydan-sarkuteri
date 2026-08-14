/* =====================================================================
   POST /api/giris   { kullaniciAdi, parola }

   Savunmalar:
   - Content-Type application/json şartı: basit CSRF koruması. Tarayıcı
     bir formdan başka kaynağa JSON content-type'ıyla istek atamaz
     (preflight gerekir), bu yüzden düz form gönderimi buradan geçemez.
   - Hız sınırı: aynı IP'den 15 dakikada 5 başarısız denemeden sonra
     parola hiç kontrol edilmeden 429.
   - Kullanıcı yoksa da sahte hash doğrulanır: yanıt süresinden
     kullanıcının var olup olmadığı anlaşılmasın.
   - Hata mesajı her durumda aynı: hangisinin yanlış olduğu sızmaz.
   ===================================================================== */

import {
  sqlAl, parolaDogrula, SAHTE_HASH, oturumAc, cerezYaz,
  onbelleksiz, metodKontrol, istemciIp, basarisizDenemeSayisi,
  denemeKaydet, bakimZamaniMi, bakimYap, SINIR, PENCERE_DK,
} from './_lib/auth.js';

const GENEL_HATA = 'Kullanıcı adı veya şifre hatalı';

export default async function handler(req, res) {
  onbelleksiz(res);
  if (!metodKontrol(req, res, 'POST')) return;

  const tur = String(req.headers['content-type'] ?? '');
  if (!tur.toLowerCase().includes('application/json')) {
    return res.status(415).json({ hata: 'Content-Type application/json olmalı' });
  }

  let govde = req.body;
  if (typeof govde === 'string') {
    try { govde = JSON.parse(govde); } catch { govde = null; }
  }
  const kullaniciAdi = govde?.kullaniciAdi;
  const parola = govde?.parola;

  if (typeof kullaniciAdi !== 'string' || typeof parola !== 'string' ||
      !kullaniciAdi || !parola) {
    return res.status(400).json({ hata: 'kullaniciAdi ve parola gerekli' });
  }

  let sql;
  try { sql = sqlAl(); }
  catch { return res.status(500).json({ hata: 'Sunucu yapılandırması eksik' }); }

  const ip = istemciIp(req);

  try {
    // --- bakım: ~%2 ihtimalle eski kayıtları topla.
    // Ayrı zamanlayıcı yok; giriş ucu yeterince sık çağrılıyor.
    if (bakimZamaniMi()) await bakimYap(sql);

    // --- hız sınırı: parolaya bakmadan önce
    const basarisiz = await basarisizDenemeSayisi(sql, ip);
    if (basarisiz >= SINIR) {
      return res.status(429).json({
        hata: `Çok fazla başarısız deneme. ${PENCERE_DK} dakika sonra tekrar deneyin.`,
      });
    }

    const kayitlar = await sql`
      SELECT id, kullanici_adi, parola_hash, sifre_degistirmeli
        FROM yoneticiler
       WHERE kullanici_adi = ${kullaniciAdi}
       LIMIT 1
    `;
    const yonetici = kayitlar[0];

    // Kullanıcı yoksa bile doğrulama yap — süre farkı bilgi sızdırmasın
    const dogru = await parolaDogrula(parola, yonetici?.parola_hash ?? SAHTE_HASH);

    if (!yonetici || !dogru) {
      await denemeKaydet(sql, ip, false);
      return res.status(401).json({ hata: GENEL_HATA });
    }

    // --- oturum aç
    const { jeton, biter } = await oturumAc(sql, yonetici.id);
    await sql`UPDATE yoneticiler SET son_giris = now() WHERE id = ${yonetici.id}`;

    await denemeKaydet(sql, ip, true);

    cerezYaz(res, jeton);
    return res.status(200).json({
      girisli: true,
      kullaniciAdi: yonetici.kullanici_adi,
      sifreDegistirmeli: yonetici.sifre_degistirmeli === true,
      oturumBiter: biter.toISOString(),
    });
  } catch (e) {
    // Ayrıntı sunucu günlüğüne; dışarıya sızdırma. Parola/jeton asla loglanmaz.
    console.error('giris başarısız:', e.message);
    return res.status(500).json({ hata: 'Giriş yapılamadı' });
  }
}
