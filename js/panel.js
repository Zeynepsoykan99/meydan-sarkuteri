/* =====================================================================
   Panel iskeleti.

   Şimdilik yalnızca kapı bekçisi: oturum var mı, şifre değiştirilmiş
   mi. Ürün yönetimi arayüzü bir sonraki adımda.

   Bu dosya hiçbir yazma isteği atmıyor — ürün/fiyat değiştiren bir uç
   zaten yok.
   ===================================================================== */

(function () {
  'use strict';

  const GIRIS = 'giris.html';
  const el = (id) => document.getElementById(id);

  const dom = {
    yukleniyor: el('yukleniyor'),
    panel: el('panel'),
    kullaniciAdi: el('kullanici-adi'),
    ozet: el('panel-ozet'),
    cikis: el('cikis'),
  };

  const girise = () => { location.replace(GIRIS); };

  dom.cikis.addEventListener('click', async () => {
    dom.cikis.disabled = true;
    dom.cikis.textContent = 'Çıkılıyor…';
    try {
      await fetch('/api/cikis', { method: 'POST', cache: 'no-store' });
    } catch {
      /* sunucuya ulaşılamasa da giriş sayfasına dönüyoruz */
    }
    girise();
  });

  /** Kapı bekçisi. Oturum yoksa ya da şifre hâlâ geçiciyse girişe atar. */
  async function kapiKontrol() {
    let veri;
    try {
      const y = await fetch('/api/yonetici/durum', { cache: 'no-store' });
      if (y.status === 401) return girise();     // oturum yok
      if (!y.ok) throw new Error(String(y.status));
      veri = await y.json();
    } catch {
      // Durum okunamadıysa panelde tutmuyoruz: güvenli taraf giriş sayfası
      return girise();
    }

    // Geçici şifre hâlâ değişmemişse panele girilmez
    if (veri.sifreDegistirmeli) return girise();

    dom.kullaniciAdi.textContent = veri.kullaniciAdi ?? '';
    dom.ozet.textContent = `Katalogda ${Number(veri.urunSayisi).toLocaleString('tr-TR')} ürün var.`;

    dom.yukleniyor.hidden = true;
    dom.panel.hidden = false;
  }

  /* Geri/ileri düğmesi ve bfcache.

     Tarayıcı sayfayı geri-ileri önbelleğinden (bfcache) canlandırdığında
     script YENİDEN ÇALIŞMAZ: DOM olduğu gibi geri gelir. Oturum bu arada
     düşmüşse — başka sekmede çıkış yapılmış, süre dolmuş, şifre
     değiştirilmiş olabilir — çıkmış kullanıcı panel ekranını görmeye
     devam eder.

     pageshow, bfcache'ten dönüşte de tetikleniyor ve persisted=true
     oluyor. O durumda paneli hemen gizleyip kapıyı yeniden çalıyoruz.

     Headless Chrome'da bfcache'i tetikleyemedim, ama Safari/iOS bunu
     agresif kullanıyor ve panel telefonda açılacak. Ucuz koruma. */
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;               // normal yükleme: baslat() zaten çalıştı
    dom.panel.hidden = true;                // önce gizle, sonra sor
    dom.yukleniyor.hidden = false;
    kapiKontrol();
  });

  kapiKontrol();
})();
