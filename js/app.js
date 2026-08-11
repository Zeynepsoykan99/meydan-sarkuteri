/* =====================================================================
   Meydan Şarküteri — katalog arayüzü
   Veri: js/products.js (REYONLAR, URUNLER)
   Sipariş yok, sepet yok — sayfa yalnızca ürünleri ve etiket fiyatlarını gösterir.
   ===================================================================== */

(function () {
  'use strict';

  const durum = {
    reyon: 'hepsi',
    arama: '',
    siralama: 'onerilen',
  };

  const el = (id) => document.getElementById(id);

  const dom = {
    reyonSerit: el('reyon-serit'),
    izgara: el('izgara'),
    bos: el('bos'),
    bosAlt: el('bos-alt'),
    bosSifirla: el('bos-sifirla'),
    katalogBaslik: el('katalog-baslik'),
    katalogOzet: el('katalog-ozet'),
    siralama: el('siralama'),
    arama: el('arama'),
    aramaSil: el('arama-sil'),
    firsatRay: el('firsat-ray'),
    gunun: el('gunun'),
    vitrinAdet: el('vitrin-adet'),
    ayakReyon: el('ayak-reyon'),
    firsatBolum: el('firsat'),
    firsatBaglanti: el('firsat-baglanti'),
    katalogBolum: el('katalog'),
  };

  /* ---------------- yardımcılar ---------------- */

  const paraBicim = new Intl.NumberFormat('tr-TR', {
    style: 'currency', currency: 'TRY', minimumFractionDigits: 2,
  });

  const para = (n) => paraBicim.format(n);

  const kacar = (s) => String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  // Türkçe arama: ı/i, ş/s, ğ/g farkları aramayı bozmasın
  const sadelestir = (s) => s
    .toLocaleLowerCase('tr')
    .replace(/[ıîi̇]/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .trim();

  const reyonAdi = (id) => {
    const r = REYONLAR.find((x) => x.id === id);
    return r ? r.ad : '';
  };

  const indirimYuzde = (u) => (u.eskiFiyat ? Math.round((1 - u.fiyat / u.eskiFiyat) * 100) : 0);

  // Fiyat etiketi: ₺ küçük, tam sayı büyük, kuruş küçük
  function etiket(fiyat, boy) {
    const [tam, kurus] = fiyat.toFixed(2).split('.');
    const tamBicim = Number(tam).toLocaleString('tr-TR');
    return `<span class="etiket etiket-${boy}"><span class="lira">₺</span>${tamBicim}<span class="kurus">,${kurus}</span></span>`;
  }

  /* ---------------- URL durumu ----------------
     Filtre paylaşılabilir olsun, geri tuşu işini görsün.
     file:// üzerinde history API farklı-kaynak sayıp hata verdiği için kapatıyoruz;
     sayfa yine de çalışır, sadece URL güncellenmez. */

  const urlDestekli = location.protocol === 'http:' || location.protocol === 'https:';

  function urldenOku() {
    if (!urlDestekli) return;
    const p = new URLSearchParams(location.search);

    const reyon = p.get('reyon');
    durum.reyon = (reyon && REYONLAR.some((r) => r.id === reyon)) ? reyon : 'hepsi';

    durum.arama = p.get('ara') || '';
    dom.arama.value = durum.arama;
    dom.aramaSil.hidden = durum.arama === '';

    const sirala = p.get('sirala');
    const gecerli = Array.from(dom.siralama.options).some((o) => o.value === sirala);
    durum.siralama = gecerli ? sirala : 'onerilen';
    dom.siralama.value = durum.siralama;
  }

  // yeniGirdi: geçmişe kayıt eklensin mi? Her tuş vuruşunda eklenmemeli.
  function urlYaz(yeniGirdi) {
    if (!urlDestekli) return;
    const p = new URLSearchParams();
    if (durum.reyon !== 'hepsi') p.set('reyon', durum.reyon);
    if (durum.arama) p.set('ara', durum.arama);
    if (durum.siralama !== 'onerilen') p.set('sirala', durum.siralama);

    const sorgu = p.toString();
    const adres = location.pathname + (sorgu ? '?' + sorgu : '');
    try {
      history[yeniGirdi ? 'pushState' : 'replaceState'](null, '', adres);
    } catch (e) { /* tarayıcı izin vermiyorsa URL'siz devam */ }
  }

  /* ---------------- arama endeksi ---------------- */

  URUNLER.forEach((u) => {
    u._ara = sadelestir(u.ad + ' ' + reyonAdi(u.reyon));
  });

  /* ---------------- filtre & sıralama ---------------- */

  function suzgectenGecir() {
    const q = sadelestir(durum.arama);
    const kelimeler = q ? q.split(/\s+/).filter(Boolean) : [];

    let liste = URUNLER.filter((u) => {
      if (durum.reyon !== 'hepsi' && u.reyon !== durum.reyon) return false;
      return kelimeler.every((k) => u._ara.includes(k));
    });

    const siralar = {
      ucuz: (a, b) => a.fiyat - b.fiyat,
      pahali: (a, b) => b.fiyat - a.fiyat,
      indirim: (a, b) => indirimYuzde(b) - indirimYuzde(a) || a.fiyat - b.fiyat,
      isim: (a, b) => a.ad.localeCompare(b.ad, 'tr'),
    };
    if (siralar[durum.siralama]) liste = liste.slice().sort(siralar[durum.siralama]);

    return liste;
  }

  /* ---------------- çizim ---------------- */

  function reyonlariCiz() {
    const hepsi = { id: 'hepsi', ad: 'Tüm reyonlar', ikon: '🧺', adet: URUNLER.length };
    dom.reyonSerit.innerHTML = [hepsi].concat(REYONLAR).map((r) => `
      <button class="reyon" type="button" data-reyon="${r.id}" aria-pressed="${r.id === durum.reyon}">
        <span class="reyon-ikon" aria-hidden="true">${r.ikon}</span>${kacar(r.ad)}
        <span class="reyon-adet">${r.adet}</span>
      </button>`).join('');

    dom.ayakReyon.innerHTML = REYONLAR.map((r) =>
      `<li><a href="#katalog" data-reyon="${r.id}">${kacar(r.ad)}</a></li>`).join('');
  }

  // Reyon etiketi yalnızca karışık listede bilgi taşır; tek reyon süzüldüğünde gereksiz tekrar.
  function kartHtml(u, reyonGoster = durum.reyon === 'hepsi') {
    const yuzde = indirimYuzde(u);
    return `
      <article class="kart" data-id="${u.id}">
        <div class="kart-gorsel-alan">
          ${yuzde ? `<span class="indirim-rozet kart-rozet">%${yuzde} indirim</span>` : ''}
          <img class="kart-gorsel" src="${kacar(u.gorsel)}" alt="${kacar(u.ad)}" loading="lazy" decoding="async" width="400" height="400">
        </div>
        ${reyonGoster ? `<p class="kart-reyon">${kacar(reyonAdi(u.reyon))}</p>` : ''}
        <h3 class="kart-ad">${kacar(u.ad)}</h3>
        <div class="kart-fiyat">
          ${etiket(u.fiyat, 's')}
          ${u.eskiFiyat ? `<s class="eski-fiyat">${para(u.eskiFiyat)}</s>` : ''}
        </div>
      </article>`;
  }

  function katalogCiz() {
    const liste = suzgectenGecir();

    dom.katalogBaslik.textContent = durum.reyon === 'hepsi' ? 'Bütün reyonlar' : reyonAdi(durum.reyon);

    dom.katalogOzet.textContent = durum.arama
      ? `"${durum.arama}" için ${liste.length} ürün bulundu.`
      : `${liste.length} ürün listeleniyor.`;

    const bosMu = liste.length === 0;
    dom.bos.hidden = !bosMu;
    dom.izgara.hidden = bosMu;
    dom.bosAlt.textContent = durum.arama
      ? `"${durum.arama}" tezgâhta yok. Başka bir kelime dene ya da bütün reyonlara dön.`
      : 'Bu reyon şu an boş. Diğer reyonlara göz atabilirsin.';

    // map, geri çağrıya indeksi de geçer — ikinci parametreyi elle veriyoruz
    dom.izgara.innerHTML = liste.map((u) => kartHtml(u)).join('');

    dom.reyonSerit.querySelectorAll('.reyon').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.reyon === durum.reyon));
    });
  }

  function vitrinCiz() {
    dom.vitrinAdet.textContent = URUNLER.length.toLocaleString('tr-TR');

    const indirimliler = URUNLER.filter((u) => u.eskiFiyat)
      .sort((a, b) => indirimYuzde(b) - indirimYuzde(a));

    const yildiz = indirimliler[0];
    if (yildiz) {
      dom.gunun.innerHTML = `
        <p class="gunun-kas">Günün etiketi</p>
        <img class="gunun-gorsel" src="${kacar(yildiz.gorsel)}" alt="${kacar(yildiz.ad)}" width="400" height="400">
        <p class="kart-reyon">${kacar(reyonAdi(yildiz.reyon))}</p>
        <h2 class="gunun-ad">${kacar(yildiz.ad)}</h2>
        <div class="gunun-fiyatlar">
          ${etiket(yildiz.fiyat, 'l')}
          <s class="eski-fiyat">${para(yildiz.eskiFiyat)}</s>
          <span class="indirim-rozet">%${indirimYuzde(yildiz)} indirim</span>
        </div>`;
    } else {
      dom.gunun.hidden = true;
    }

    // Rayda günün etiketi tekrar etmesin
    const ray = indirimliler.slice(1, 15);
    dom.firsatRay.innerHTML = ray.map((u) => `<div role="listitem">${kartHtml(u, true)}</div>`).join('');

    // Ray boşsa bölümü de ona giden vitrin düğmesini de kaldır — yoksa düğme hiçliğe bağlanır
    if (!ray.length) {
      dom.firsatBolum.hidden = true;
      dom.firsatBaglanti.hidden = true;
    }
  }

  /* ---------------- olaylar ---------------- */

  document.addEventListener('click', (e) => {
    const reyonDugme = e.target.closest('[data-reyon]');
    if (!reyonDugme) return;

    // Ayaktaki bağlantılar da buradan yürüsün; #katalog'u URL'e eklemesinler
    if (reyonDugme.tagName === 'A') e.preventDefault();

    durum.reyon = reyonDugme.dataset.reyon;
    katalogCiz();
    urlYaz(true);
    dom.katalogBolum.scrollIntoView({ block: 'start' });
  });

  dom.arama.addEventListener('input', () => {
    durum.arama = dom.arama.value.trim();
    dom.aramaSil.hidden = durum.arama === '';
    katalogCiz();
    urlYaz(false);   // her harf geçmişe kayıt düşmesin
  });

  dom.aramaSil.addEventListener('click', () => {
    dom.arama.value = '';
    durum.arama = '';
    dom.aramaSil.hidden = true;
    katalogCiz();
    urlYaz(false);
    dom.arama.focus();
  });

  dom.siralama.addEventListener('change', () => {
    durum.siralama = dom.siralama.value;
    katalogCiz();
    urlYaz(true);
  });

  dom.bosSifirla.addEventListener('click', () => {
    durum.reyon = 'hepsi';
    durum.arama = '';
    durum.siralama = 'onerilen';
    dom.arama.value = '';
    dom.siralama.value = 'onerilen';
    dom.aramaSil.hidden = true;
    katalogCiz();
    urlYaz(true);
  });

  window.addEventListener('popstate', () => {
    urldenOku();
    katalogCiz();
  });

  // "/" aramaya odaklanır — ama bir metin alanında yazarken araya girmesin
  const yaziYaziliyor = () => {
    const o = document.activeElement;
    return !!o && (o.isContentEditable ||
      o.tagName === 'INPUT' || o.tagName === 'TEXTAREA' || o.tagName === 'SELECT');
  };

  document.addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || yaziYaziliyor()) return;
    e.preventDefault();
    dom.arama.focus();
  });

  // Görsel yüklenemezse kart boş bir çerçeve gibi durmasın
  document.addEventListener('error', (e) => {
    const hedef = e.target;
    if (hedef.tagName !== 'IMG') return;
    hedef.style.visibility = 'hidden';
    const alan = hedef.closest('.kart-gorsel-alan');
    if (alan) alan.classList.add('gorsel-yok');
  }, true);

  /* ---------------- açılış ---------------- */

  urldenOku();
  reyonlariCiz();
  vitrinCiz();
  katalogCiz();
})();
