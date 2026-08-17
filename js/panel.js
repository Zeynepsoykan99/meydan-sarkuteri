/* =====================================================================
   Panel — ürün listesi ve fiyat düzenleme.

   Kullanıcı: market sahibi, dükkânda, telefonda, elinde ürünle. Günlük
   işi fiyat güncellemek. Tasarım kararları buna göre:
     - kaydettikten sonra listede AYNI YERDE kalınıyor (sırayla ilerliyor)
     - virgüllü giriş kabul ediliyor (Türkçe klavye)
     - "kaydettim sandım ama kaydolmadı" durumu asla sessiz geçmiyor
     - fiyatı 10 kat aşan değişiklik KAYDEDİLMEDEN önce soruluyor
     - fiyatı doğru olan ürün, değiştirilmeden onaylanabiliyor

   Ürün ekleme/silme yok; yalnızca fiyat, indirim, stok, ölçü.
   ===================================================================== */

(function () {
  'use strict';

  const GIRIS = 'giris.html';
  const YEDEK_ESKI_GUN = 7;
  const SICRAMA = 10;             // bu katın üstü/altı değişiklik sorulur
  const SERIT_ANAHTAR = 'yedek-serit-kapatildi';

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
    listeOzet: el('liste-ozet'), liste: el('urun-liste'), listeBos: el('liste-bos'),
    listeHata: el('liste-hata'), listeHataMetin: el('liste-hata-metin'),
    listeHataKapat: el('liste-hata-kapat'),

    d: el('duzenle'), dGorsel: el('d-gorsel'), dReyon: el('d-reyon'), dAd: el('d-ad'),
    dKapat: el('d-kapat'), dHata: el('d-hata'),
    dUyari: el('d-uyari'), dUyariMetin: el('d-uyari-metin'), dGeriAl: el('d-geri-al'),
    dFiyat: el('d-fiyat'), dEski: el('d-eski'),
    dIndirimli: el('d-indirimli'), dIndirimAlan: el('d-indirim-alan'),
    dStokVar: el('d-stok-var'), dStokYok: el('d-stok-yok'),
    dMiktar: el('d-miktar'), dBirim: el('d-birim'),
    dKaydet: el('d-kaydet'), dOnay: el('d-onay'),

    onay: el('onay'), onayMetin: el('onay-metin'),
    onayEvet: el('onay-evet'), onayHayir: el('onay-hayir'),
  };

  let URUNLER = [];
  let REYONLAR = [];
  let acikUrun = null;         // düzenlenen ürün
  let oncekiHal = null;        // "Geri al" için, istemcide tutuluyor
  // Bu çizimde onaylananlar: satırları yerinde ama soluk duruyor.
  // Liste yeniden hesaplanınca (süzgeç/arama/reyon) boşalıyor.
  const yeniOnaylananlar = new Set();

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

  const onaylanmis = (u) => u.kaynak === 'dukkan';
  const olcusuzMu = (u) => u.miktar === null || u.miktar === undefined;

  function rozetler(u) {
    // Onaylanmış üründe rozet yok: 470 satırlık listede her satıra rozet
    // koymak gürültü. Rozet yalnızca "burada yapacak iş var" demek.
    const r = [];
    if (u.stokta === false) r.push('<span class="rozet rozet-yok">Şu an yok</span>');
    if (!onaylanmis(u)) r.push('<span class="rozet rozet-kontrolsuz">Fiyat onaylanmadı</span>');
    if (olcusuzMu(u)) r.push('<span class="rozet rozet-olcusuz">Ölçü eksik</span>');
    return r.join('');
  }

  /* ---------------- süzme ---------------- */

  function suz() {
    const kelimeler = sadelestir(durum.arama).split(/\s+/).filter(Boolean);
    return URUNLER.filter((u) => {
      if (durum.reyon !== 'hepsi' && u.reyon !== durum.reyon) return false;
      if (durum.kontrolsuz && onaylanmis(u)) return false;
      if (durum.olcusuz && !olcusuzMu(u)) return false;
      return kelimeler.every((k) => u._ara.includes(k));
    });
  }

  /* ---------------- çizim ---------------- */

  function satirHtml(u) {
    const eski = u.eskiFiyat ? `<span class="satir-eski">${para(u.eskiFiyat)}</span>` : '';
    const yeni = yeniOnaylananlar.has(u.id);

    // Hızlı onay: sahibi pencereyi hiç açmadan sıra sıra ilerleyebilsin.
    // İşin büyük kısmı bu akış olacak.
    let onay = '';
    if (yeni) {
      // Az önce onaylandı: satır yerinde duruyor, düğme ✓ işaretli ve pasif.
      onay = `
        <button class="satir-onay satir-onay-bitti" type="button" disabled
                aria-label="${kacar(u.ad)} fiyatı onaylandı">
          <span class="satir-onay-isaret" aria-hidden="true">✓</span>
          <span class="satir-onay-yazi" aria-hidden="true">onaylı</span>
        </button>`;
    } else if (!onaylanmis(u)) {
      onay = `
        <button class="satir-onay" type="button" data-onay="${kacar(u.id)}"
                title="Fiyat doğru" aria-label="${kacar(u.ad)} fiyatı doğru">
          <span class="satir-onay-isaret" aria-hidden="true">✓</span>
          <span class="satir-onay-yazi" aria-hidden="true">doğru</span>
        </button>`;
    }
    return `
      <li class="satir${yeni ? ' satir-soluk' : ''}">
        <button class="urun-satir" type="button" data-id="${kacar(u.id)}">
          <img class="satir-gorsel" src="${kacar(u.gorsel ?? '')}" alt=""
               loading="lazy" decoding="async" width="52" height="52">
          <span class="satir-orta">
            <span class="satir-ad">${kacar(u.ad)}</span>
            <span class="satir-rozetler">${rozetler(u)}</span>
          </span>
          <span class="satir-fiyat">${para(u.fiyat)}${eski}</span>
        </button>${onay}
      </li>`;
  }

  // Sayfalama yok: 470 satırın çizimi ölçüldü, 45 ms. Görseller lazy,
  // ekrana girmeyen inmiyor. "Daha göster" düğmesi kazançsız bir engeldi.
  //
  // Liste YALNIZCA burada baştan çiziliyor: açılışta ve süzgeç/arama/reyon
  // değişince. Onaylama listeyi yeniden çizmiyor — çizseydi süzgeç açıkken
  // onaylanan satır anında düşer, sıradaki yukarı kayar ve hızlı dokunan
  // biri yanlış ürünü onaylardı.
  function listeCiz() {
    yeniOnaylananlar.clear();     // liste yeniden hesaplanıyor, işaretler sıfırlanır
    const liste = suz();

    dom.liste.innerHTML = liste.map(satirHtml).join('');
    dom.liste.hidden = liste.length === 0;
    dom.listeBos.hidden = liste.length !== 0;

    dom.listeOzet.textContent = liste.length === URUNLER.length
      ? `${liste.length} ürün`
      : `${liste.length} ürün (${URUNLER.length} içinden)`;
  }

  function sayaclariCiz() {
    const bekleyen = URUNLER.filter((u) => !onaylanmis(u)).length;
    const olcusuz = URUNLER.filter(olcusuzMu).length;
    const onayli = URUNLER.length - bekleyen;

    dom.sayiKontrolsuz.textContent = bekleyen;
    dom.sayiOlcusuz.textContent = olcusuz;

    dom.ilerlemeYazi.innerHTML =
      `<strong>${URUNLER.length}</strong> üründen ` +
      `<strong>${onayli}</strong> tanesinin fiyatı onaylandı`;
    const yuzde = URUNLER.length ? (onayli / URUNLER.length) * 100 : 0;
    dom.ilerlemeDolu.style.width = yuzde + '%';
  }

  /* ---------------- yedek tazeliği ----------------
     Sahibi bu konuda bir şey yapamaz (yedek alma terminal işi), o yüzden
     düğme yok — yalnızca bilgi, ve kapatılabilir. */

  // Kapatma oturum boyu hatırlanıyor: sayfa yenilenince geri gelmiyor,
  // tarayıcı kapanınca sıfırlanıyor.
  const seritKapatildi = () => {
    try { return sessionStorage.getItem(SERIT_ANAHTAR) === '1'; } catch { return false; }
  };

  function yedekSeridiCiz(yedekDamgasi, dbDamgasi) {
    if (!yedekDamgasi || !dbDamgasi) return;            // bilinmiyorsa gösterme
    if (seritKapatildi()) return;
    const y = new Date(yedekDamgasi), d = new Date(dbDamgasi);
    if (isNaN(y) || isNaN(d)) return;

    const gun = Math.floor((d.getTime() - y.getTime()) / 86400000);
    if (gun <= YEDEK_ESKI_GUN) return;

    dom.yedekMetin.textContent =
      `Yedek kopya ${gun} gün eskidi. Site bir arıza sırasında eski fiyatları gösterebilir.`;
    dom.yedekSerit.hidden = false;
  }

  dom.yedekKapat.addEventListener('click', () => {
    dom.yedekSerit.hidden = true;
    try { sessionStorage.setItem(SERIT_ANAHTAR, '1'); } catch { /* özel mod */ }
  });

  /* ---------------- onay sorusu ----------------
     Büyük fiyat değişikliği KAYDEDİLMEDEN önce soruluyor. Sunucudaki
     uyarı (reyon medyanı gibi istemcinin bilmediği sinyaller) yerinde
     duruyor — iki katman birlikte çalışıyor. */

  function sor(mesaj) {
    dom.onayMetin.innerHTML = mesaj;
    dom.onay.showModal();
    return new Promise((cevapla) => {
      const bitir = (karar) => {
        dom.onayEvet.removeEventListener('click', evet);
        dom.onayHayir.removeEventListener('click', hayir);
        dom.onay.removeEventListener('cancel', vazgec);
        if (dom.onay.open) dom.onay.close();
        cevapla(karar);
      };
      const evet = () => bitir(true);
      const hayir = () => bitir(false);
      const vazgec = (e) => { e.preventDefault(); bitir(false); };
      dom.onayEvet.addEventListener('click', evet);
      dom.onayHayir.addEventListener('click', hayir);
      dom.onay.addEventListener('cancel', vazgec);
    });
  }

  /** Fiyat SICRAMA katından fazla değiştiyse sor; değilse doğrudan geç. */
  async function sicramaOnayi(yeniFiyat) {
    const eski = acikUrun?.fiyat;
    if (typeof yeniFiyat !== 'number' || typeof eski !== 'number' || eski <= 0) return true;
    const oran = yeniFiyat / eski;
    if (oran <= SICRAMA && oran >= 1 / SICRAMA) return true;

    const artis = oran > 1;
    const kat = artis ? oran : 1 / oran;
    const katYazi = kat >= 10 ? Math.round(kat) : kat.toFixed(1).replace('.', ',');
    return sor(
      `Bu ürünün fiyatını <strong>${katYazi} kat ${artis ? 'artırıyorsunuz' : 'düşürüyorsunuz'}</strong>.` +
      `<span class="onay-fiyatlar">${kacar(para(eski))} <b>&rarr;</b> ${kacar(para(yeniFiyat))}</span>` +
      'Doğru mu?');
  }

  /* ---------------- düzenleme ---------------- */

  const sayiYaz = (n) => (n === null || n === undefined ? '' : String(n).replace('.', ','));

  function formDoldur(u) {
    dom.dGorsel.src = u.gorsel ?? '';
    dom.dGorsel.alt = u.ad;
    dom.dReyon.textContent = (REYONLAR.find((r) => r.id === u.reyon) ?? {}).ad ?? '';
    dom.dAd.textContent = u.ad;
    dom.dFiyat.value = sayiYaz(u.fiyat);
    dom.dIndirimli.checked = u.eskiFiyat !== null && u.eskiFiyat !== undefined;
    dom.dEski.value = sayiYaz(u.eskiFiyat);
    indirimAlaniCiz();
    dom.dStokVar.checked = u.stokta !== false;
    dom.dStokYok.checked = u.stokta === false;
    dom.dMiktar.value = sayiYaz(u.miktar);
    dom.dBirim.value = u.birim ?? '';
    // "Fiyat doğru" yalnızca henüz onaylanmamış üründe anlamlı
    dom.dOnay.hidden = onaylanmis(u);
    hatalariTemizle();
    dom.dUyari.hidden = true;
    degisiklikKontrol();
  }

  const indirimAlaniCiz = () => { dom.dIndirimAlan.hidden = !dom.dIndirimli.checked; };

  /** Formdaki değerler — sunucuya gidecek biçimde (nokta ile). */
  function formOku() {
    return {
      fiyat: sayiyaCevir(dom.dFiyat.value),
      // Anahtar kapalıysa indirim kalkıyor: sunucuya açıkça null gidiyor.
      eskiFiyat: dom.dIndirimli.checked ? sayiyaCevir(dom.dEski.value) : null,
      stokta: dom.dStokVar.checked,
      miktar: sayiyaCevir(dom.dMiktar.value),
      birim: dom.dBirim.value || null,
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
    // Anahtar açıksa önceki fiyat boş bırakılamaz
    const eksikIndirim = dom.dIndirimli.checked && sayiyaCevir(dom.dEski.value) === null;
    dom.dKaydet.disabled = bozuk || eksikIndirim || Object.keys(degisiklikCikar()).length === 0;
  }

  ['input', 'change'].forEach((olay) => {
    [dom.dFiyat, dom.dEski, dom.dMiktar, dom.dBirim, dom.dStokVar, dom.dStokYok]
      .forEach((g) => g.addEventListener(olay, degisiklikKontrol));
  });
  dom.dIndirimli.addEventListener('change', () => {
    indirimAlaniCiz();
    if (dom.dIndirimli.checked) dom.dEski.focus();
    degisiklikKontrol();
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
    const oncekiOnayli = i !== -1 ? onaylanmis(URUNLER[i]) : true;
    if (i !== -1) {
      yeni._ara = URUNLER[i]._ara;
      URUNLER[i] = yeni;
    }
    if (acikUrun && acikUrun.id === yeni.id) acikUrun = yeni;
    if (!oncekiOnayli && onaylanmis(yeni)) yeniOnaylananlar.add(yeni.id);

    sayaclariCiz();

    // Yalnızca o satır değişiyor — süzgeç açık olsa bile liste baştan
    // çizilmiyor, satırlar yerinden oynamıyor. Süzgeçten düşme, liste bir
    // sonraki hesaplamada (süzgeç/arama/reyon değişince) oluyor.
    const satir = dom.liste.querySelector(`[data-id="${CSS.escape(yeni.id)}"]`)?.closest('.satir');
    if (satir) satir.outerHTML = satirHtml(yeni);
  }

  /** Listedeki hızlı onay: pencere açılmadan, fiyat değişmeden. */
  async function fiyatOnayla(u) {
    dom.listeHata.hidden = true;
    try {
      // Fiyat gönderiliyor ama aynı değer: sunucu kaynak'ı 'dukkan' yapar,
      // değer değişmediği için fiyat_gecmisi'ne kayıt düşmez.
      const sonuc = await iste('/api/yonetici/urun', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: u.id, fiyat: u.fiyat }),
      });
      urunuTazele(sonuc.urun);
      return true;
    } catch (e) {
      if (e.tur === 'oturum') return false;
      dom.listeHataMetin.textContent =
        `${u.ad}: ` + (e.mesaj ?? e.veri?.hata ?? 'Onaylanamadı. Değişiklik KAYDEDİLMEDİ.');
      dom.listeHata.hidden = false;
      return false;
    }
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

    // Sıçrama varsa KAYDETMEDEN önce sor. Sunucunun uyarısı kaydettikten
    // sonra geliyor; sahibi onu görmeden geçebilir, bu katman erken durduruyor.
    if (!(await sicramaOnayi(yama.fiyat))) return;

    // "Geri al" için önceki hâli istemcide tutuyoruz — sunucuya sormuyoruz
    oncekiHal = {
      fiyat: acikUrun.fiyat, eskiFiyat: acikUrun.eskiFiyat,
      stokta: acikUrun.stokta, miktar: acikUrun.miktar, birim: acikUrun.birim,
    };
    await kaydet(yama);
  });

  /* "Fiyat doğru": mevcut fiyatı olduğu gibi gönderir. Sunucu fiyat
     geldiği için kaynak'ı 'dukkan' yapar; değer değişmediğinden
     fiyat_gecmisi'ne kayıt düşmez. Arka uçta değişiklik gerekmedi. */
  dom.dOnay.addEventListener('click', async () => {
    if (!acikUrun) return;
    dom.dOnay.disabled = true;
    dom.dOnay.textContent = 'Onaylanıyor…';
    const basarili = await kaydet({ fiyat: acikUrun.fiyat }, { uyariGoster: false });
    dom.dOnay.disabled = false;
    dom.dOnay.textContent = 'Fiyat doğru';
    if (basarili) dom.d.close();      // pencere kapansın, listede kalınsın
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

  dom.liste.addEventListener('click', async (e) => {
    // Hızlı onay önce bakılıyor: satırın içinde ama pencereyi açmamalı
    const onay = e.target.closest('[data-onay]');
    if (onay) {
      const u = URUNLER.find((x) => x.id === onay.dataset.onay);
      if (!u || onay.disabled) return;
      onay.disabled = true;   // :disabled zaten soluklaştırıyor
      // Başarılıysa satır yeniden çizildiği için düğme zaten kayboluyor;
      // başarısızsa geri açılmalı, yoksa tekrar denenemez.
      if (!(await fiyatOnayla(u))) onay.disabled = false;
      return;
    }
    const d = e.target.closest('[data-id]');
    if (d) duzenleAc(d.dataset.id);
  });

  dom.listeHataKapat.addEventListener('click', () => { dom.listeHata.hidden = true; });

  dom.dKapat.addEventListener('click', () => dom.d.close());
  dom.d.addEventListener('cancel', (e) => { e.preventDefault(); dom.d.close(); });
  dom.d.addEventListener('click', (e) => { if (e.target === dom.d) dom.d.close(); });

  /* ---------------- süzgeç olayları ---------------- */

  dom.arama.addEventListener('input', () => {
    durum.arama = dom.arama.value.trim();
    dom.aramaSil.hidden = durum.arama === '';
    listeCiz();
  });
  dom.aramaSil.addEventListener('click', () => {
    dom.arama.value = ''; durum.arama = ''; dom.aramaSil.hidden = true;
    listeCiz(); dom.arama.focus();
  });
  dom.reyon.addEventListener('change', () => {
    durum.reyon = dom.reyon.value; listeCiz();
  });
  dom.sKontrolsuz.addEventListener('click', () => {
    durum.kontrolsuz = !durum.kontrolsuz;
    dom.sKontrolsuz.setAttribute('aria-pressed', String(durum.kontrolsuz));
    listeCiz();
  });
  dom.sOlcusuz.addEventListener('click', () => {
    durum.olcusuz = !durum.olcusuz;
    dom.sOlcusuz.setAttribute('aria-pressed', String(durum.olcusuz));
    listeCiz();
  });

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

    sayaclariCiz();
    listeCiz();
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
