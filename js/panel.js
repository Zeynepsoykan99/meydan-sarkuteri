/* =====================================================================
   Panel — ürün listesi ve fiyat düzenleme.

   Kullanıcı: market sahibi, dükkânda, telefonda, elinde ürünle. Günlük
   işi fiyat güncellemek. Tasarım kararları buna göre:
     - kaydettikten sonra listede AYNI YERDE kalınıyor (sırayla ilerliyor)
     - virgüllü giriş kabul ediliyor (Türkçe klavye)
     - "kaydettim sandım ama kaydolmadı" durumu asla sessiz geçmiyor
     - aykırı fiyat uyarısı tek dokunuşla geri alınabiliyor

   Ürün ekleme/silme yok; yalnızca fiyat, eski fiyat, stok, ölçü.
   ===================================================================== */

(function () {
  'use strict';

  const GIRIS = 'giris.html';
  const SAYFA_BOYU = 60;          // ilk render; gerisi "daha göster"
  const YEDEK_ESKI_GUN = 7;

  const { sadelestir, kacar, para, sayiyaCevir } = window.Ortak;
  const el = (id) => document.getElementById(id);

  const dom = {
    yukleniyor: el('yukleniyor'), panel: el('panel'),
    kullaniciAdi: el('kullanici-adi'), cikis: el('cikis'),
    yedekSerit: el('yedek-serit'), yedekMetin: el('yedek-metin'), yedekKapat: el('yedek-kapat'),
    ilerlemeYazi: el('ilerleme-yazi'), ilerlemeDolu: el('ilerleme-dolu'),
    arama: el('p-arama'), aramaSil: el('p-arama-sil'), reyon: el('p-reyon'),
    sKontrolsuz: el('s-kontrolsuz'), sOlcusuz: el('s-olcusuz'),
    sayiKontrolsuz: el('sayi-kontrolsuz'), sayiOlcusuz: el('sayi-olcusuz'),
    listeOzet: el('liste-ozet'), liste: el('urun-liste'),
    listeDaha: el('liste-daha'), dahaGoster: el('daha-goster'), listeBos: el('liste-bos'),

    d: el('duzenle'), dGorsel: el('d-gorsel'), dReyon: el('d-reyon'), dAd: el('d-ad'),
    dKapat: el('d-kapat'), dHata: el('d-hata'),
    dUyari: el('d-uyari'), dUyariMetin: el('d-uyari-metin'), dGeriAl: el('d-geri-al'),
    dFiyat: el('d-fiyat'), dEski: el('d-eski'),
    dStokVar: el('d-stok-var'), dStokYok: el('d-stok-yok'),
    dMiktar: el('d-miktar'), dBirim: el('d-birim'), dKaydet: el('d-kaydet'),
  };

  let URUNLER = [];
  let REYONLAR = [];
  let acikUrun = null;         // düzenlenen ürün
  let oncekiHal = null;        // "Geri al" için, istemcide tutuluyor
  let gosterilen = SAYFA_BOYU;

  const durum = { arama: '', reyon: 'hepsi', kontrolsuz: false, olcusuz: false };

  const girise = () => { location.replace(GIRIS); };

  /* ---------------- ağ ----------------
     401 her yerden gelebilir (oturum 30 gün ama dolabilir); tek yerde
     yakalayıp giriş sayfasına atıyoruz. */

  async function iste(adres, secenekler = {}) {
    let y;
    try {
      y = await fetch(adres, { cache: 'no-store', ...secenekler });
    } catch {
      // Ağ hatası: istek sunucuya ULAŞMADI. Bunu açıkça söylemek şart —
      // "kaydettim sandım ama kaydolmadı" en kötü senaryo.
      throw { tur: 'ag', mesaj: 'Bağlantı kurulamadı. Değişiklik KAYDEDİLMEDİ.' };
    }
    if (y.status === 401) { girise(); throw { tur: 'oturum', mesaj: 'Oturum sona erdi' }; }

    let veri = null;
    try { veri = await y.json(); } catch { /* gövdesiz olabilir */ }

    if (y.status === 429) {
      throw { tur: 'limit', mesaj: veri?.hata ?? 'Çok fazla istek, biraz bekleyin.' };
    }
    if (!y.ok) throw { tur: 'sunucu', durum: y.status, veri };
    return veri;
  }

  /* ---------------- ürün durumu ---------------- */

  const kontrolEdilmis = (u) => u.kaynak === 'dukkan';
  const olcusuzMu = (u) => u.miktar === null || u.miktar === undefined;

  function rozetler(u) {
    const r = [];
    if (u.stokta === false) r.push('<span class="rozet rozet-yok">Şu an yok</span>');
    if (!kontrolEdilmis(u)) r.push('<span class="rozet rozet-kontrolsuz">Fiyat kontrol edilmedi</span>');
    else r.push('<span class="rozet rozet-dukkan">Fiyat sizin</span>');
    if (olcusuzMu(u)) r.push('<span class="rozet rozet-olcusuz">Ölçü eksik</span>');
    return r.join('');
  }

  /* ---------------- süzme ---------------- */

  function suz() {
    const kelimeler = sadelestir(durum.arama).split(/\s+/).filter(Boolean);
    return URUNLER.filter((u) => {
      if (durum.reyon !== 'hepsi' && u.reyon !== durum.reyon) return false;
      if (durum.kontrolsuz && kontrolEdilmis(u)) return false;
      if (durum.olcusuz && !olcusuzMu(u)) return false;
      return kelimeler.every((k) => u._ara.includes(k));
    });
  }

  /* ---------------- çizim ---------------- */

  function satirHtml(u) {
    const eski = u.eskiFiyat ? `<span class="satir-eski">${para(u.eskiFiyat)}</span>` : '';
    return `
      <li>
        <button class="urun-satir" type="button" data-id="${kacar(u.id)}">
          <img class="satir-gorsel" src="${kacar(u.gorsel ?? '')}" alt=""
               loading="lazy" decoding="async" width="52" height="52">
          <span class="satir-orta">
            <span class="satir-ad">${kacar(u.ad)}</span>
            <span class="satir-rozetler">${rozetler(u)}</span>
          </span>
          <span class="satir-fiyat">${para(u.fiyat)}${eski}</span>
        </button>
      </li>`;
  }

  function listeCiz() {
    const liste = suz();
    const parca = liste.slice(0, gosterilen);

    dom.liste.innerHTML = parca.map(satirHtml).join('');
    dom.liste.hidden = liste.length === 0;
    dom.listeBos.hidden = liste.length !== 0;

    dom.listeOzet.textContent = liste.length === URUNLER.length
      ? `${liste.length} ürün`
      : `${liste.length} ürün (${URUNLER.length} içinden)`;

    const kalan = liste.length - parca.length;
    dom.listeDaha.hidden = kalan <= 0;
    if (kalan > 0) dom.dahaGoster.textContent = `${kalan} ürün daha göster`;
  }

  function sayaclariCiz() {
    const kontrolsuz = URUNLER.filter((u) => !kontrolEdilmis(u)).length;
    const olcusuz = URUNLER.filter(olcusuzMu).length;
    const kontrollu = URUNLER.length - kontrolsuz;

    dom.sayiKontrolsuz.textContent = kontrolsuz;
    dom.sayiOlcusuz.textContent = olcusuz;

    dom.ilerlemeYazi.innerHTML =
      `<strong>${URUNLER.length}</strong> üründen <strong>${kontrollu}</strong> tanesinin fiyatı kontrol edildi`;
    const yuzde = URUNLER.length ? (kontrollu / URUNLER.length) * 100 : 0;
    dom.ilerlemeDolu.style.width = yuzde + '%';
  }

  /* ---------------- yedek tazeliği ----------------
     Sahibi bu konuda bir şey yapamaz (yedek alma terminal işi), o yüzden
     düğme yok — yalnızca bilgi, ve kapatılabilir. */

  function yedekSeridiCiz(yedekDamgasi, dbDamgasi) {
    if (!yedekDamgasi || !dbDamgasi) return;            // bilinmiyorsa gösterme
    const y = new Date(yedekDamgasi), d = new Date(dbDamgasi);
    if (isNaN(y) || isNaN(d)) return;

    const gun = Math.floor((d.getTime() - y.getTime()) / 86400000);
    if (gun <= YEDEK_ESKI_GUN) return;

    dom.yedekMetin.textContent =
      `Yedek kopya ${gun} gün eskidi. Site bir arıza sırasında eski fiyatları gösterebilir.`;
    dom.yedekSerit.hidden = false;
  }

  dom.yedekKapat.addEventListener('click', () => { dom.yedekSerit.hidden = true; });

  /* ---------------- düzenleme ---------------- */

  const sayiYaz = (n) => (n === null || n === undefined ? '' : String(n).replace('.', ','));

  function formDoldur(u) {
    dom.dGorsel.src = u.gorsel ?? '';
    dom.dGorsel.alt = u.ad;
    dom.dReyon.textContent = (REYONLAR.find((r) => r.id === u.reyon) ?? {}).ad ?? '';
    dom.dAd.textContent = u.ad;
    dom.dFiyat.value = sayiYaz(u.fiyat);
    dom.dEski.value = sayiYaz(u.eskiFiyat);
    dom.dStokVar.checked = u.stokta !== false;
    dom.dStokYok.checked = u.stokta === false;
    dom.dMiktar.value = sayiYaz(u.miktar);
    dom.dBirim.value = u.birim ?? '';
    hatalariTemizle();
    dom.dUyari.hidden = true;
    degisiklikKontrol();
  }

  /** Formdaki değerler — sunucuya gidecek biçimde (nokta ile). */
  function formOku() {
    const miktar = sayiyaCevir(dom.dMiktar.value);
    const birim = dom.dBirim.value || null;
    return {
      fiyat: sayiyaCevir(dom.dFiyat.value),
      eskiFiyat: sayiyaCevir(dom.dEski.value),
      stokta: dom.dStokVar.checked,
      miktar,
      birim,
    };
  }

  /** Kaydet düğmesi yalnızca gerçekten bir şey değiştiyse aktif. */
  function degisiklikCikar() {
    if (!acikUrun) return {};
    const f = formOku();
    const yama = {};
    const esit = (a, b) => (a === null && b === null) || Number(a) === Number(b);

    if (!Number.isNaN(f.fiyat) && !esit(f.fiyat, acikUrun.fiyat)) yama.fiyat = f.fiyat;
    if (!Number.isNaN(f.eskiFiyat) && !esit(f.eskiFiyat, acikUrun.eskiFiyat)) yama.eskiFiyat = f.eskiFiyat;
    if (f.stokta !== (acikUrun.stokta !== false)) yama.stokta = f.stokta;
    if (!Number.isNaN(f.miktar) && !esit(f.miktar, acikUrun.miktar)) yama.miktar = f.miktar;
    if (f.birim !== (acikUrun.birim ?? null)) yama.birim = f.birim;

    return yama;
  }

  function degisiklikKontrol() {
    const bozuk = [dom.dFiyat, dom.dEski, dom.dMiktar]
      .some((g) => Number.isNaN(sayiyaCevir(g.value)));
    dom.dKaydet.disabled = bozuk || Object.keys(degisiklikCikar()).length === 0;
  }

  ['input', 'change'].forEach((olay) => {
    [dom.dFiyat, dom.dEski, dom.dMiktar, dom.dBirim, dom.dStokVar, dom.dStokYok]
      .forEach((g) => g.addEventListener(olay, degisiklikKontrol));
  });

  function hatalariTemizle() {
    dom.dHata.hidden = true;
    dom.dHata.innerHTML = '';
    [dom.dFiyat, dom.dEski, dom.dMiktar, dom.dBirim].forEach((g) => g.classList.remove('alan-hatali'));
  }

  /** Sunucudan gelen doğrulama hatalarını göster; ilgili alanı işaretle. */
  function hatalariGoster(hatalar) {
    const liste = Array.isArray(hatalar) ? hatalar : [hatalar];
    dom.dHata.innerHTML = liste.length === 1
      ? kacar(liste[0])
      : `${liste.length} sorun var:<ul>${liste.map((h) => `<li>${kacar(h)}</li>`).join('')}</ul>`;
    dom.dHata.hidden = false;

    // Alan alan işaretle: hangi kutunun sorunlu olduğu görünsün
    const esle = [[/fiyat/i, dom.dFiyat], [/eskifiyat/i, dom.dEski],
                  [/miktar/i, dom.dMiktar], [/birim/i, dom.dBirim]];
    liste.forEach((h) => {
      const metin = String(h).toLocaleLowerCase('tr');
      if (/eskifiyat|eski fiyat/.test(metin)) { dom.dEski.classList.add('alan-hatali'); return; }
      for (const [kalip, girdi] of esle) if (kalip.test(metin)) girdi.classList.add('alan-hatali');
    });
    dom.dHata.scrollIntoView({ block: 'nearest' });
  }

  function urunuTazele(yeni) {
    const i = URUNLER.findIndex((u) => u.id === yeni.id);
    if (i !== -1) {
      yeni._ara = URUNLER[i]._ara;
      URUNLER[i] = yeni;
    }
    acikUrun = yeni;
    sayaclariCiz();
    listeCiz();       // gosterilen değişmediği için aynı konumda kalıyor
  }

  async function kaydet(yama, { uyariGoster = true } = {}) {
    dom.dKaydet.disabled = true;
    const eskiMetin = dom.dKaydet.textContent;
    dom.dKaydet.textContent = 'Kaydediliyor…';
    hatalariTemizle();

    try {
      const sonuc = await iste('/api/yonetici/urun', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: acikUrun.id, ...yama }),
      });

      urunuTazele(sonuc.urun);
      formDoldur(sonuc.urun);

      if (uyariGoster && sonuc.uyarilar?.length) {
        dom.dUyariMetin.innerHTML = sonuc.uyarilar.map((u) => `<p>${kacar(u)}</p>`).join('');
        dom.dUyari.hidden = false;
      }
      return true;
    } catch (e) {
      if (e.tur === 'oturum') return false;                 // yönlendirme yapıldı
      if (e.tur === 'ag' || e.tur === 'limit') { hatalariGoster(e.mesaj); return false; }
      if (e.durum === 400 && e.veri) {
        hatalariGoster(e.veri.hatalar ?? e.veri.hata ?? 'Geçersiz değer');
        return false;
      }
      hatalariGoster(e.veri?.hata ?? 'Kaydedilemedi. Değişiklik uygulanmadı.');
      return false;
    } finally {
      dom.dKaydet.textContent = eskiMetin;
      degisiklikKontrol();
    }
  }

  dom.dKaydet.addEventListener('click', async () => {
    const yama = degisiklikCikar();
    if (!Object.keys(yama).length) return;

    // "Geri al" için önceki hâli istemcide tutuyoruz — sunucuya sormuyoruz
    oncekiHal = {
      fiyat: acikUrun.fiyat, eskiFiyat: acikUrun.eskiFiyat,
      stokta: acikUrun.stokta, miktar: acikUrun.miktar, birim: acikUrun.birim,
    };
    await kaydet(yama);
  });

  dom.dGeriAl.addEventListener('click', async () => {
    if (!oncekiHal) return;
    dom.dGeriAl.disabled = true;
    dom.dGeriAl.textContent = 'Geri alınıyor…';
    const basarili = await kaydet({ ...oncekiHal }, { uyariGoster: false });
    dom.dGeriAl.disabled = false;
    dom.dGeriAl.textContent = 'Geri al';
    if (basarili) dom.dUyari.hidden = true;
  });

  /* ---------------- pencere ---------------- */

  function duzenleAc(id) {
    const u = URUNLER.find((x) => x.id === id);
    if (!u) return;
    acikUrun = u;
    oncekiHal = null;
    formDoldur(u);
    if (!dom.d.open) dom.d.showModal();
  }

  dom.liste.addEventListener('click', (e) => {
    const d = e.target.closest('[data-id]');
    if (d) duzenleAc(d.dataset.id);
  });

  dom.dKapat.addEventListener('click', () => dom.d.close());
  dom.d.addEventListener('cancel', (e) => { e.preventDefault(); dom.d.close(); });
  dom.d.addEventListener('click', (e) => { if (e.target === dom.d) dom.d.close(); });

  /* ---------------- süzgeç olayları ---------------- */

  dom.arama.addEventListener('input', () => {
    durum.arama = dom.arama.value.trim();
    dom.aramaSil.hidden = durum.arama === '';
    gosterilen = SAYFA_BOYU;
    listeCiz();
  });
  dom.aramaSil.addEventListener('click', () => {
    dom.arama.value = ''; durum.arama = ''; dom.aramaSil.hidden = true;
    gosterilen = SAYFA_BOYU; listeCiz(); dom.arama.focus();
  });
  dom.reyon.addEventListener('change', () => {
    durum.reyon = dom.reyon.value; gosterilen = SAYFA_BOYU; listeCiz();
  });
  dom.sKontrolsuz.addEventListener('click', () => {
    durum.kontrolsuz = !durum.kontrolsuz;
    dom.sKontrolsuz.setAttribute('aria-pressed', String(durum.kontrolsuz));
    gosterilen = SAYFA_BOYU; listeCiz();
  });
  dom.sOlcusuz.addEventListener('click', () => {
    durum.olcusuz = !durum.olcusuz;
    dom.sOlcusuz.setAttribute('aria-pressed', String(durum.olcusuz));
    gosterilen = SAYFA_BOYU; listeCiz();
  });
  // Düğme "410 ürün daha göster" yazıyor; yazdığını yapsın — tek dokunuşta hepsi.
  // 470 satırın çizimi ölçüldü: 4 ms. Görseller lazy, ekrana girmeyen inmiyor.
  dom.dahaGoster.addEventListener('click', () => { gosterilen = Infinity; listeCiz(); });

  dom.cikis.addEventListener('click', async () => {
    dom.cikis.disabled = true;
    dom.cikis.textContent = 'Çıkılıyor…';
    try { await fetch('/api/cikis', { method: 'POST', cache: 'no-store' }); } catch { /* yine de çık */ }
    girise();
  });

  /* ---------------- açılış ---------------- */

  async function veriYukle() {
    const veri = await iste('/api/yonetici/urunler');

    REYONLAR = veri.reyonlar ?? [];
    URUNLER = (veri.urunler ?? []).map((u) => ({
      ...u,
      _ara: sadelestir(u.ad + ' ' + ((REYONLAR.find((r) => r.id === u.reyon) ?? {}).ad ?? '')),
    }));

    dom.reyon.innerHTML = '<option value="hepsi">Tüm reyonlar</option>' +
      REYONLAR.map((r) => `<option value="${kacar(r.id)}">${kacar(r.ad)}</option>`).join('');

    yedekSeridiCiz(veri.yedekDamgasi, veri.guncellendi);

    const t0 = performance.now();
    sayaclariCiz();
    listeCiz();
    // Render süresini ölçüp konsola yazıyoruz: 470 satır telefonda ağır mı?
    console.info(`panel: ${URUNLER.length} ürün, ilk ${gosterilen} satır ${Math.round(performance.now() - t0)} ms'de çizildi`);
  }

  async function kapiKontrol() {
    let durumVeri;
    try {
      durumVeri = await iste('/api/yonetici/durum');
    } catch (e) {
      if (e.tur === 'oturum') return;      // girise() çağrıldı
      return girise();                      // durum okunamıyorsa güvenli taraf
    }
    if (durumVeri.sifreDegistirmeli) return girise();

    dom.kullaniciAdi.textContent = durumVeri.kullaniciAdi ?? '';

    try {
      await veriYukle();
    } catch (e) {
      if (e.tur === 'oturum') return;
      dom.liste.innerHTML =
        `<li class="liste-bos">Ürünler yüklenemedi. ${kacar(e.mesaj ?? 'Sayfayı yenileyin.')}</li>`;
    }

    dom.yukleniyor.hidden = true;
    dom.panel.hidden = false;
  }

  /* Geri/ileri önbelleği: sayfa bfcache'ten canlanırsa script yeniden
     çalışmaz ve oturumu düşmüş kullanıcı paneli görmeye devam eder. */
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    dom.panel.hidden = true;
    dom.yukleniyor.hidden = false;
    if (dom.d.open) dom.d.close();
    kapiKontrol();
  });

  kapiKontrol();
})();
