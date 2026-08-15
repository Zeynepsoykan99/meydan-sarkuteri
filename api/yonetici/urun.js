/* =====================================================================
   PATCH /api/yonetici/urun   — KORUMALI
   Gövde: { id, fiyat?, eskiFiyat?, miktar?, birim?, stokta? }

   Kısmi güncelleme: yalnızca gönderilen alanlar değişir.

   id gövdede geliyor, dinamik route ([id].js) kullanılmıyor — tek uç,
   tek dosya. Yama gövdede zaten var, id'yi de oraya koymak fazladan
   bir fonksiyon dosyası açmaktan basit.

   Düzenlenebilir alanlar yalnızca fiyat, eskiFiyat, miktar, birim,
   stokta. ad / reyon / gorsel / id / kaynak buradan değiştirilemez;
   tanınmayan alan sessizce yok sayılmaz, 400 ile geri çevrilir.

   Ürün ekleme ve silme YOK.
   ===================================================================== */

import { sqlAl, oturumDogrula, onbelleksiz, metodKontrol } from '../_lib/auth.js';
import { urunYuku, yamaDogrula, fiyatUyarilari, DUZENLENEBILIR } from '../_lib/urun.js';

export default async function handler(req, res) {
  onbelleksiz(res);
  if (!metodKontrol(req, res, 'PATCH')) return;

  const tur = String(req.headers['content-type'] ?? '');
  if (!tur.toLowerCase().includes('application/json')) {
    return res.status(415).json({ hata: 'Content-Type application/json olmalı' });
  }

  try {
    const oturum = await oturumDogrula(req);
    if (!oturum) return res.status(401).json({ hata: 'Oturum gerekli' });

    let govde = req.body;
    if (typeof govde === 'string') {
      try { govde = JSON.parse(govde); } catch { govde = null; }
    }
    if (!govde || typeof govde !== 'object' || Array.isArray(govde)) {
      return res.status(400).json({ hata: 'Gövde bir JSON nesnesi olmalı' });
    }

    const id = govde.id;
    if (typeof id !== 'string' || !id) {
      return res.status(400).json({ hata: 'id gerekli' });
    }

    const sql = sqlAl();

    const bulunan = await sql`
      SELECT id, ad, reyon, gorsel, fiyat, eski_fiyat, miktar, birim,
             stokta, kaynak, guncellendi
        FROM urunler WHERE id = ${id} LIMIT 1
    `;
    const mevcut = bulunan[0];
    if (!mevcut) {
      return res.status(404).json({ hata: `"${id}" numaralı ürün bulunamadı` });
    }

    // Tanınan tek bir alan bile yoksa yapacak iş yok
    const dokunulan = DUZENLENEBILIR.filter((k) =>
      Object.prototype.hasOwnProperty.call(govde, k));
    const taninmayan = Object.keys(govde).filter((k) =>
      k !== 'id' && !DUZENLENEBILIR.includes(k));

    if (dokunulan.length === 0 && taninmayan.length === 0) {
      return res.status(400).json({
        hata: 'Değiştirilecek alan yok',
        duzenlenebilir: DUZENLENEBILIR,
      });
    }

    const { hatalar, yeniFiyat, yeniEski, yeniMiktar, yeniBirim } =
      yamaDogrula(mevcut, govde);

    if (hatalar.length) {
      return res.status(400).json({
        hata: hatalar.length === 1 ? hatalar[0] : `${hatalar.length} alan geçersiz`,
        hatalar,
      });
    }

    /* --- kaynak ---
       Fiyat panelden gönderildiyse bu ürünün fiyatı artık dükkânın
       kendi bilgisi; kazınan katalogdan gelen değer değil. Sahibi
       böylece hangi ürünleri henüz gözden geçirmediğini görebiliyor.
       Yalnızca fiyat gönderildiğinde değişiyor — stok işaretlemek
       fiyatı doğrulamak anlamına gelmiyor. */
    const fiyatGonderildi = Object.prototype.hasOwnProperty.call(govde, 'fiyat');
    const yeniKaynak = fiyatGonderildi ? 'dukkan' : mevcut.kaynak;

    /* --- uyarılar: kaydı engellemez --- */
    let uyarilar = [];
    if (fiyatGonderildi && yeniFiyat !== Number(mevcut.fiyat)) {
      const [{ medyan }] = await sql`
        SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY fiyat) AS medyan
          FROM urunler WHERE reyon = ${mevcut.reyon}
      `;
      uyarilar = fiyatUyarilari(mevcut.fiyat, yeniFiyat, Number(medyan ?? 0));
    }

    /* --- yaz ---
       Bütün alanlar tek UPDATE'te; dokunulmayanlar mevcut değerleriyle
       geri yazılıyor. fiyat değişirse trigger fiyat_gecmisi'ne kayıt
       atıp guncellendi damgasını tazeliyor. */
    const guncel = await sql`
      UPDATE urunler
         SET fiyat      = ${yeniFiyat},
             eski_fiyat = ${yeniEski},
             miktar     = ${yeniMiktar},
             birim      = ${yeniBirim},
             stokta     = ${Object.prototype.hasOwnProperty.call(govde, 'stokta')
                            ? govde.stokta : mevcut.stokta},
             kaynak     = ${yeniKaynak}
       WHERE id = ${id}
      RETURNING id, ad, reyon, gorsel, fiyat, eski_fiyat, miktar, birim,
                stokta, kaynak, guncellendi
    `;

    return res.status(200).json({
      guncellendi: true,
      degisenAlanlar: dokunulan,
      urun: urunYuku(guncel[0], true),
      ...(uyarilar.length ? { uyarilar } : {}),
    });
  } catch (e) {
    // Veritabanı hata metnini dışarıya sızdırmıyoruz
    console.error('yonetici/urun başarısız:', e.message);
    return res.status(500).json({ hata: 'Ürün güncellenemedi' });
  }
}
