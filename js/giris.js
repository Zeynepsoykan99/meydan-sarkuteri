/* =====================================================================
   Giriş ve zorunlu şifre değiştirme.

   Hata mesajları bilerek genel: hangi alanın yanlış olduğu
   söylenmiyor. Sunucu da aynısını yapıyor; buradaki metinler onu
   tekrar ediyor, kendi başına karar vermiyor.

   İstemcideki 12 karakter kontrolü yalnızca kolaylık — asıl kontrol
   sunucuda. Buradaki kontrol kaldırılsa da sunucu reddediyor.
   ===================================================================== */

(function () {
  'use strict';

  const PANEL = 'panel.html';
  const ASGARI = 12;

  const el = (id) => document.getElementById(id);

  const dom = {
    yukleniyor: el('yukleniyor'),
    girisForm: el('giris-form'),
    girisHata: el('giris-hata'),
    kullanici: el('kullanici'),
    sifre: el('sifre'),
    girisDugme: el('giris-dugme'),

    degistirForm: el('degistir-form'),
    degistirHata: el('degistir-hata'),
    degistirKullanici: el('degistir-kullanici'),
    mevcutSifre: el('mevcut-sifre'),
    yeniSifre: el('yeni-sifre'),
    yeniSifreTekrar: el('yeni-sifre-tekrar'),
    degistirDugme: el('degistir-dugme'),
  };

  const hataGoster = (kutu, metin) => {
    kutu.textContent = metin;
    kutu.hidden = false;
  };
  const hataGizle = (kutu) => { kutu.hidden = true; kutu.textContent = ''; };

  const panelAc = () => { location.replace(PANEL); };

  function ekranGoster(hangi) {
    dom.yukleniyor.hidden = true;
    dom.girisForm.hidden = hangi !== 'giris';
    dom.degistirForm.hidden = hangi !== 'degistir';
    if (hangi === 'giris') dom.kullanici.focus();
    if (hangi === 'degistir') dom.mevcutSifre.focus();
  }

  async function jsonIste(adres, govde) {
    const y = await fetch(adres, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(govde),
    });
    let veri = null;
    try { veri = await y.json(); } catch { /* gövdesiz yanıt */ }
    return { durum: y.status, veri };
  }

  /* ---------------- giriş ---------------- */

  dom.girisForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hataGizle(dom.girisHata);

    const kullaniciAdi = dom.kullanici.value.trim();
    const parola = dom.sifre.value;
    if (!kullaniciAdi || !parola) {
      return hataGoster(dom.girisHata, 'Kullanıcı adı ve şifre gerekli.');
    }

    dom.girisDugme.disabled = true;
    dom.girisDugme.textContent = 'Giriş yapılıyor…';

    try {
      const { durum, veri } = await jsonIste('/api/giris', { kullaniciAdi, parola });

      if (durum === 200) {
        dom.sifre.value = '';
        if (veri?.sifreDegistirmeli) {
          dom.degistirKullanici.value = kullaniciAdi;
          ekranGoster('degistir');
          return;
        }
        return panelAc();
      }

      if (durum === 429) {
        return hataGoster(dom.girisHata,
          veri?.hata ?? 'Çok fazla deneme, biraz bekleyin.');
      }
      // 401 ve diğerleri: hangi alanın yanlış olduğunu belli etme
      hataGoster(dom.girisHata, veri?.hata ?? 'Kullanıcı adı veya şifre hatalı');
    } catch {
      hataGoster(dom.girisHata, 'Bağlantı kurulamadı. Tekrar deneyin.');
    } finally {
      dom.girisDugme.disabled = false;
      dom.girisDugme.textContent = 'Giriş yap';
    }
  });

  /* ---------------- zorunlu şifre değiştirme ---------------- */

  dom.degistirForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hataGizle(dom.degistirHata);

    const mevcutSifre = dom.mevcutSifre.value;
    const yeniSifre = dom.yeniSifre.value;
    const tekrar = dom.yeniSifreTekrar.value;

    if (yeniSifre.length < ASGARI) {
      return hataGoster(dom.degistirHata, `Yeni şifre en az ${ASGARI} karakter olmalı.`);
    }
    if (yeniSifre !== tekrar) {
      return hataGoster(dom.degistirHata, 'Yeni şifreler eşleşmiyor.');
    }
    if (yeniSifre === mevcutSifre) {
      return hataGoster(dom.degistirHata, 'Yeni şifre mevcut şifreyle aynı olamaz.');
    }

    dom.degistirDugme.disabled = true;
    dom.degistirDugme.textContent = 'Değiştiriliyor…';

    try {
      const { durum, veri } = await jsonIste('/api/sifre-degistir', { mevcutSifre, yeniSifre });

      if (durum === 200) {
        dom.mevcutSifre.value = dom.yeniSifre.value = dom.yeniSifreTekrar.value = '';
        return panelAc();
      }
      if (durum === 429) {
        return hataGoster(dom.degistirHata,
          veri?.hata ?? 'Çok fazla deneme, biraz bekleyin.');
      }
      if (durum === 401) {
        // Oturum düşmüş de olabilir, mevcut şifre de yanlış olabilir
        return hataGoster(dom.degistirHata, veri?.hata ?? 'Mevcut şifre hatalı');
      }
      hataGoster(dom.degistirHata, veri?.hata ?? 'Şifre değiştirilemedi.');
    } catch {
      hataGoster(dom.degistirHata, 'Bağlantı kurulamadı. Tekrar deneyin.');
    } finally {
      dom.degistirDugme.disabled = false;
      dom.degistirDugme.textContent = 'Şifreyi değiştir ve devam et';
    }
  });

  /* ---------------- açılış ----------------
     Zaten girişliyse forma hiç bakmadan panele. Şifre değiştirmesi
     gerekiyorsa doğrudan zorunlu ekrana. */

  async function durumaGoreEkran() {
    try {
      const y = await fetch('/api/oturum', { cache: 'no-store' });
      const veri = await y.json();

      if (veri?.girisli && veri.sifreDegistirmeli) {
        dom.degistirKullanici.value = veri.kullaniciAdi ?? '';
        return ekranGoster('degistir');
      }
      if (veri?.girisli) return panelAc();
    } catch {
      /* durum okunamadıysa giriş formunu göster */
    }
    ekranGoster('giris');
  }

  /* Panelde iken geri düğmesiyle buraya dönülürse sayfa bfcache'ten
     canlanır ve script yeniden çalışmaz; ekranda o anki duruma
     uymayan bir form kalır (örneğin hâlâ girişliyken giriş formu, ya
     da yarım doldurulmuş şifre alanları). pageshow ile durumu yeniden
     soruyor ve alanları temizliyoruz. */
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    dom.sifre.value = '';
    dom.mevcutSifre.value = dom.yeniSifre.value = dom.yeniSifreTekrar.value = '';
    hataGizle(dom.girisHata);
    hataGizle(dom.degistirHata);
    dom.girisForm.hidden = true;
    dom.degistirForm.hidden = true;
    dom.yukleniyor.hidden = false;
    durumaGoreEkran();
  });

  durumaGoreEkran();
})();
