/* =====================================================================
   Meydan Şarküteri — katalog arayüzü

   Veri iki kaynaktan gelebilir, sırayla denenir:
     1. /api/katalog          canlı veritabanı
     2. data/products.json    son bilinen iyi kopya (yedek)
   Yedeğe düşülürse kullanıcıya fiyatların güncel olmayabileceği söylenir.
   İkisi de başarısızsa hata ekranı devreye girer.

   Veri fetch ile geldiği için sayfa file:// ile açılamaz — tarayıcı yerel
   dosyada fetch'i farklı-kaynak sayıp engelliyor. "npx serve ." gerekir.

   Sipariş yok, sepet yok — sayfa yalnızca ürünleri ve etiket fiyatlarını gösterir.
   ===================================================================== */

(function () {
  'use strict';

  const API_ADRESI = '/api/katalog';
  const YEDEK_ADRESI = 'data/products.json';

  // Veri fetch ile geldiği için bunlar açılışta boş; baslat() dolduruyor.
  let REYONLAR = [];
  let URUNLER = [];
  let GUNCELLENDI = null;
  let reyonSayaci = new Map();   // reyon id -> ürün sayısı (veriden hesaplanır)

  const durum = {
    reyon: 'hepsi',
    arama: '',
    siralama: 'onerilen',
    indirim: false,   // yalnızca indirimli ürünler
    min: null,        // fiyat alt sınırı (TL), null = sınırsız
    max: null,
    urun: null,       // açık detay penceresindeki ürünün id'si
  };

  const VARSAYILAN = { ...durum };

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
    ayakReyonSutun: el('ayak-reyon').closest('.ayak-sutun'),
    firsatBolum: el('firsat'),
    firsatBaglanti: el('firsat-baglanti'),
    katalogBolum: el('katalog'),
    veriTarihi: el('veri-tarihi'),
    indirimSuzgec: el('indirim-suzgec'),
    fiyatMin: el('fiyat-min'),
    fiyatMax: el('fiyat-max'),
    detay: el('urun-detay'),
    detayIc: el('detay-ic'),
    detayKapat: el('detay-kapat'),
    basaDon: el('basa-don'),
  };

  /* ---------------- yardımcılar ---------------- */

  /* Bu üçü js/ortak.js'te, panelle paylaşılıyor. Özellikle arama
     sadeleştirmesi: iki tarafta ayrışırsa panelde bulunan ürün ana
     sitede bulunamaz hale gelir. */
  const { para, kacar, sadelestir } = window.Ortak;

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

  /* ---------------- birim fiyat ----------------
     Bir fiyat kataloğunda asıl karşılaştırılan şey birim fiyattır: 2 L'lik
     yağ 500 ml'likten "pahalı" görünür ama litresi ucuz olabilir. Miktarı
     ürün adından çıkarıyoruz, veride ayrı bir alan yok.

     Veride üç tuzak var, üçü de sınanmıştır:
       "Zeytin 121-160 Kg"   kalibre (kilodaki tane sayısı), 160 kg değil
       "Zeytini 291-320 Ad/Kg"  aynısı
       "Tencere Seti 3,5 L +7 L"  iki ayrı ölçü, hangisi olduğu belirsiz
     Üçünde de ölçü yok sayılır; yanlış sayı göstermektense hiç göstermeyiz. */

  const BIRIM_CARPAN = { g: 0.001, gr: 0.001, kg: 1, ml: 0.001, cl: 0.01, l: 1, lt: 1 };
  const AGIRLIK_BIRIMI = new Set(['g', 'gr', 'kg']);

  // "4X80 Ml" -> 0.32 L · "500 G" -> 0.5 kg · "6 x 1.5 L" -> 9 L
  const OLCU_RE = /(?:(\d+)\s*[x×]\s*)?(\d+(?:[.,]\d+)?)\s*(kg|gr|g|ml|cl|lt|l)\b/gi;
  // "32'li" / "40’lı" / "25 adet" — "3 Katlı"yı yakalamamak için "kat" listede yok
  const ADET_RE = /(\d+)\s*['’]?\s*(?:l[iıuü]|adet|rulo)\b/i;

  function olcuCikar(ad) {
    const bulunan = [];
    let m;
    OLCU_RE.lastIndex = 0;
    while ((m = OLCU_RE.exec(ad)) !== null) {
      // Önündeki karakter rakam/tire/bölü ise bu bir aralık ya da oran; ölçü değil
      const onceki = ad[m.index - 1];
      if (onceki && /[\d\-.,/]/.test(onceki)) continue;

      const adet = m[1] ? Number(m[1]) : 1;
      const miktar = Number(m[2].replace(',', '.'));
      if (!(adet > 0) || !(miktar > 0)) continue;

      bulunan.push({
        birim: AGIRLIK_BIRIMI.has(m[3].toLowerCase()) ? 'kg' : 'L',
        deger: adet * miktar * BIRIM_CARPAN[m[3].toLowerCase()],
      });
    }
    if (bulunan.length === 1) return bulunan[0];
    if (bulunan.length > 1) return null;        // belirsiz

    const a = ad.match(ADET_RE);                // ağırlık/hacim yoksa adede düş
    return a && Number(a[1]) > 1 ? { birim: 'adet', deger: Number(a[1]) } : null;
  }

  // Önce veriye bak: miktar/birim alanları doldurulmuşsa onlar geçerli.
  // Yalnızca boşsalar adı ayrıştırmaya düşüyoruz — böylece veri düzeltilerek
  // ayrıştırıcının yanıldığı ürünler tek tek elle onarılabilir.
  function olcu(u) {
    if (typeof u.miktar === 'number' && u.miktar > 0 && u.birim) {
      return { deger: u.miktar, birim: u.birim };
    }
    return olcuCikar(u.ad);
  }

  function birimFiyat(u) {
    const o = olcu(u);
    if (!o) return null;
    const deger = u.fiyat / o.deger;
    // 1 kg / 1 L ambalajda birim fiyat, fiyatın kendisi — tekrar etmenin anlamı yok
    if (Math.abs(deger - u.fiyat) < 0.01) return null;
    return { deger, birim: o.birim };
  }

  function birimFiyatYazi(u) {
    const bf = birimFiyat(u);
    if (!bf) return '';
    const sayi = bf.deger >= 100
      ? Math.round(bf.deger).toLocaleString('tr-TR')
      : bf.deger.toFixed(2).replace('.', ',');
    return `₺${sayi}/${bf.birim}`;
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

    durum.indirim = p.get('indirim') === '1';
    dom.indirimSuzgec.setAttribute('aria-pressed', String(durum.indirim));

    const sayi = (ad) => {
      const n = Number(p.get(ad));
      return p.get(ad) !== null && isFinite(n) && n >= 0 ? n : null;
    };
    durum.min = sayi('min');
    durum.max = sayi('max');
    dom.fiyatMin.value = durum.min === null ? '' : durum.min;
    dom.fiyatMax.value = durum.max === null ? '' : durum.max;

    const urun = p.get('urun');
    durum.urun = URUNLER.some((u) => u.id === urun) ? urun : null;
  }

  // yeniGirdi: geçmişe kayıt eklensin mi? Her tuş vuruşunda eklenmemeli.
  function urlYaz(yeniGirdi) {
    if (!urlDestekli) return;
    const p = new URLSearchParams();
    if (durum.reyon !== 'hepsi') p.set('reyon', durum.reyon);
    if (durum.arama) p.set('ara', durum.arama);
    if (durum.siralama !== 'onerilen') p.set('sirala', durum.siralama);
    if (durum.indirim) p.set('indirim', '1');
    if (durum.min !== null) p.set('min', durum.min);
    if (durum.max !== null) p.set('max', durum.max);
    if (durum.urun) p.set('urun', durum.urun);

    const sorgu = p.toString();
    const adres = location.pathname + (sorgu ? '?' + sorgu : '');
    try {
      history[yeniGirdi ? 'pushState' : 'replaceState'](null, '', adres);
    } catch (e) { /* tarayıcı izin vermiyorsa URL'siz devam */ }
  }

  /* ---------------- arama endeksi ---------------- */

  // Veri geldikten sonra bir kez çalışır. Birim fiyatı da burada hesaplıyoruz;
  // sıralama her karşılaştırmada adı yeniden ayrıştırmasın.
  function endeksleriKur() {
    reyonSayaci = new Map();

    URUNLER.forEach((u) => {
      reyonSayaci.set(u.reyon, (reyonSayaci.get(u.reyon) || 0) + 1);

      u._ara = sadelestir(u.ad + ' ' + reyonAdi(u.reyon));
      const bf = birimFiyat(u);
      u._bf = bf ? bf.deger : null;
      u._bfYazi = bf ? birimFiyatYazi(u) : '';
      // Sıralama grubu: ₺/kg ile ₺/L kabaca kıyaslanabilir, ₺/adet değil.
      // Hepsini tek sayı gibi sıralarsak ucuz görünen adetliler başa geçer.
      u._bfGrup = !bf ? 2 : (bf.birim === 'adet' ? 1 : 0);
    });
  }

  /* ---------------- filtre & sıralama ---------------- */

  function suzgectenGecir() {
    const q = sadelestir(durum.arama);
    const kelimeler = q ? q.split(/\s+/).filter(Boolean) : [];

    let liste = URUNLER.filter((u) => {
      if (durum.reyon !== 'hepsi' && u.reyon !== durum.reyon) return false;
      if (durum.indirim && !u.eskiFiyat) return false;
      if (durum.min !== null && u.fiyat < durum.min) return false;
      if (durum.max !== null && u.fiyat > durum.max) return false;
      return kelimeler.every((k) => u._ara.includes(k));
    });

    const siralar = {
      ucuz: (a, b) => a.fiyat - b.fiyat,
      pahali: (a, b) => b.fiyat - a.fiyat,
      indirim: (a, b) => indirimYuzde(b) - indirimYuzde(a) || a.fiyat - b.fiyat,
      isim: (a, b) => a.ad.localeCompare(b.ad, 'tr'),
      // Önce ağırlık/hacim (kıyaslanabilir), sonra adet, en sonda birimsizler
      birim: (a, b) => a._bfGrup - b._bfGrup || (a._bf - b._bf) || 0,
    };

    // Stokta olmayanlar hangi sıralama seçilirse seçilsin en sona.
    // Sort kararlı olduğu için "onerilen"de dosya sırası korunur.
    const karsilastir = siralar[durum.siralama];
    liste = liste.slice().sort((a, b) =>
      (a.stokta === false) - (b.stokta === false) ||
      (karsilastir ? karsilastir(a, b) : 0)
    );

    return liste;
  }

  /* ---------------- çizim ---------------- */

  function reyonlariCiz() {
    // Sayılar veriden hesaplanır; JSON'da elle tutulan bir "adet" alanı yok.
    const hepsi = { id: 'hepsi', ad: 'Tüm reyonlar', ikon: '🧺' };
    const sayi = (id) => (id === 'hepsi' ? URUNLER.length : (reyonSayaci.get(id) || 0));

    dom.reyonSerit.innerHTML = [hepsi].concat(REYONLAR).map((r) => `
      <button class="reyon" type="button" data-reyon="${r.id}" aria-pressed="${r.id === durum.reyon}">
        <span class="reyon-ikon" aria-hidden="true">${r.ikon}</span>${kacar(r.ad)}
        <span class="reyon-adet">${sayi(r.id)}</span>
      </button>`).join('');

    dom.ayakReyon.innerHTML = REYONLAR.map((r) =>
      `<li><a href="#katalog" data-reyon="${r.id}">${kacar(r.ad)}</a></li>`).join('');

    seritSoluklugu();
  }

  // Şeridin sağında görünmeyen reyon kaldıysa soluklaşmayı aç.
  // Kaydırma çubuğu gizli olduğu için başka ipucu yok.
  function seritSoluklugu() {
    const k = dom.reyonSerit;
    const kaldi = k.scrollWidth - k.clientWidth - k.scrollLeft > 4;
    k.parentElement.classList.toggle('daha-var', kaldi);
  }

  // Reyon etiketi yalnızca karışık listede bilgi taşır; tek reyon süzüldüğünde gereksiz tekrar.
  function kartHtml(u, reyonGoster = durum.reyon === 'hepsi') {
    const yuzde = indirimYuzde(u);
    // Stokta olmayanda indirim rozetini göstermiyoruz: alınamayan üründe
    // indirim bilgi taşımıyor, iki rozet de aynı köşeye düşüyor.
    const yok = u.stokta === false;
    return `
      <article class="kart${yok ? ' kart-yok' : ''}" data-id="${u.id}">
        <div class="kart-gorsel-alan">
          ${yok ? '<span class="yok-rozet kart-rozet">Şu an yok</span>'
                : (yuzde ? `<span class="indirim-rozet kart-rozet">%${yuzde} indirim</span>` : '')}
          <img class="kart-gorsel" src="${kacar(u.gorsel)}" alt="${kacar(u.ad)}" loading="lazy" decoding="async" width="400" height="400">
        </div>
        ${reyonGoster ? `<p class="kart-reyon">${kacar(reyonAdi(u.reyon))}</p>` : ''}
        <h3 class="kart-ad" title="${kacar(u.ad)}">${kacar(u.ad)}</h3>
        <div class="kart-fiyat">
          ${etiket(u.fiyat, 's')}
          ${u.eskiFiyat ? `<s class="eski-fiyat">${para(u.eskiFiyat)}</s>` : ''}
        </div>
        ${u._bfYazi ? `<p class="birim-fiyat">${u._bfYazi}</p>` : ''}
        <button class="kart-ac" type="button" data-urun="${u.id}"
                aria-label="${kacar(u.ad)} — ayrıntılar"></button>
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

  // Sayfa "güncel fiyatlar" diyor; veri ise sabit bir anlık görüntü.
  // Tarihi veriden okuyoruz ki elle yazılıp eskimesin.
  const tarihYazi = () => {
    const t = new Date(GUNCELLENDI);
    return (!GUNCELLENDI || isNaN(t)) ? '' :
      t.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  function veriTarihiCiz() {
    const yazi = tarihYazi();
    if (!yazi) { dom.veriTarihi.closest('li').hidden = true; return; }
    dom.veriTarihi.innerHTML =
      `Fiyatlar <time datetime="${kacar(GUNCELLENDI)}">${yazi}</time> tarihli`;
  }

  /* ---------------- ürün ayrıntısı ---------------- */

  function detayCiz(u) {
    const yuzde = indirimYuzde(u);
    // 'dukkan' = fiyatı dükkânın kendisi girdi. Bunu Migros'a yazmak
    // ziyaretçiye yanlış bilgi verirdi: fiyatın sahibi belli olsun.
    const KAYNAK_ADI = {
      a101: 'A101 Kapıda',
      migros: 'Migros Sanal Market',
      dukkan: 'Meydan Şarküteri',
    };
    const kaynakAdi = KAYNAK_ADI[u.kaynak] ?? 'Belirtilmemiş';
    dom.detayIc.innerHTML = `
      <div class="detay-gorsel-alan${u.stokta === false ? ' gorsel-soluk' : ''}">
        ${u.stokta === false
          ? '<span class="yok-rozet kart-rozet">Şu an yok</span>'
          : (yuzde ? `<span class="indirim-rozet kart-rozet">%${yuzde} indirim</span>` : '')}
        <img class="detay-gorsel" src="${kacar(u.gorsel)}" alt="${kacar(u.ad)}" width="400" height="400">
      </div>
      <div class="detay-bilgi">
        <p class="kart-reyon">${kacar(reyonAdi(u.reyon))}</p>
        <h2 class="detay-ad" id="detay-ad">${kacar(u.ad)}</h2>
        <div class="detay-fiyatlar">
          ${etiket(u.fiyat, 'l')}
          ${u.eskiFiyat ? `<s class="eski-fiyat">${para(u.eskiFiyat)}</s>` : ''}
        </div>
        ${u._bfYazi ? `<p class="detay-birim">Birim fiyatı <strong>${u._bfYazi}</strong></p>` : ''}
        <!-- Reyon, fiyat ve eski fiyat yukarıda zaten var; burada yalnızca
             kartta görünmeyen bilgi duruyor. -->
        <dl class="detay-liste">
          <dt>Durum</dt><dd>${u.stokta === false ? 'Şu an yok' : 'Tezgâhta'}</dd>
          <dt>Kaynak</dt><dd>${kaynakAdi}</dd>
          <dt>Fiyat tarihi</dt><dd>${tarihYazi()}</dd>
        </dl>
        <p class="detay-not">Bu sayfa bir fiyat kataloğudur; sipariş alınmaz.</p>
      </div>`;
  }

  function detayAc(id, urlGuncelle = true) {
    const u = URUNLER.find((x) => x.id === id);
    if (!u) return;
    durum.urun = u.id;
    detayCiz(u);
    if (!dom.detay.open) dom.detay.showModal();
    if (urlGuncelle) urlYaz(true);
  }

  function detayKapat(urlGuncelle = true) {
    durum.urun = null;
    if (dom.detay.open) dom.detay.close();
    if (urlGuncelle) urlYaz(true);
  }

  // Açık pencereyi URL durumuyla eşitler (geri/ileri tuşu ve ilk yükleme için)
  function detaySenkron() {
    if (durum.urun) detayAc(durum.urun, false);
    else if (dom.detay.open) dom.detay.close();
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

  /* ---------------- olaylar ----------------
     Veri geldikten sonra bağlanıyor: yükleme sırasında tıklanacak bir kart,
     sayılacak bir reyon yok. Tek sefer bağlanır (bkz. olaylarBagli). */

  function olaylariBagla() {

  document.addEventListener('click', (e) => {
    const kartDugme = e.target.closest('[data-urun]');
    if (kartDugme) { detayAc(kartDugme.dataset.urun); return; }

    const reyonDugme = e.target.closest('[data-reyon]');
    if (!reyonDugme) return;

    // Ayaktaki bağlantılar da buradan yürüsün; #katalog'u URL'e eklemesinler
    if (reyonDugme.tagName === 'A') e.preventDefault();

    durum.reyon = reyonDugme.dataset.reyon;
    katalogCiz();
    urlYaz(true);
    dom.katalogBolum.scrollIntoView({ block: 'start' });
  });

  /* --- ürün ayrıntısı --- */

  dom.detayKapat.addEventListener('click', () => detayKapat());

  // Esc: "cancel" olayını iptal edip kapatmayı kendimiz yapıyoruz, yoksa
  // tarayıcı pencereyi kapatır ama URL'de ?urun= asılı kalır.
  // ("close" olayına güvenmiyoruz — bazı tarayıcılarda programatik
  //  close() sonrası fırlamıyor; yine de yedek olarak dinliyoruz.)
  dom.detay.addEventListener('cancel', (e) => {
    e.preventDefault();
    detayKapat();
  });
  dom.detay.addEventListener('close', () => { if (durum.urun) detayKapat(); });

  dom.detay.addEventListener('click', (e) => {
    if (e.target === dom.detay) detayKapat();   // ::backdrop tıklaması
  });

  /* --- filtreler --- */

  dom.indirimSuzgec.addEventListener('click', () => {
    durum.indirim = !durum.indirim;
    dom.indirimSuzgec.setAttribute('aria-pressed', String(durum.indirim));
    katalogCiz();
    urlYaz(true);
  });

  // Fiyat kutuları: yazarken filtrele, geçmişe kayıt düşürme
  [dom.fiyatMin, dom.fiyatMax].forEach((girdi) => {
    girdi.addEventListener('input', () => {
      const oku = (g) => {
        const n = Number(g.value);
        return g.value.trim() !== '' && isFinite(n) && n >= 0 ? n : null;
      };
      durum.min = oku(dom.fiyatMin);
      durum.max = oku(dom.fiyatMax);
      katalogCiz();
      urlYaz(false);
    });
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
    Object.assign(durum, VARSAYILAN);
    kontrolleriEsitle();
    katalogCiz();
    urlYaz(true);
  });

  // Form kontrollerini durumdan yeniden yazar (sıfırlama ve geri tuşu için)
  function kontrolleriEsitle() {
    dom.arama.value = durum.arama;
    dom.aramaSil.hidden = durum.arama === '';
    dom.siralama.value = durum.siralama;
    dom.indirimSuzgec.setAttribute('aria-pressed', String(durum.indirim));
    dom.fiyatMin.value = durum.min === null ? '' : durum.min;
    dom.fiyatMax.value = durum.max === null ? '' : durum.max;
  }

  window.addEventListener('popstate', () => {
    urldenOku();
    kontrolleriEsitle();
    katalogCiz();
    detaySenkron();
  });

  /* --- başa dön --- */

  dom.basaDon.addEventListener('click', () => {
    window.scrollTo({ top: 0 });
    dom.arama.focus({ preventScroll: true });
  });

  // Düğme yalnızca bir ekran boyu aşağıdayken görünsün
  let basaDonAcik = false;
  window.addEventListener('scroll', () => {
    const gorunsun = window.scrollY > window.innerHeight;
    if (gorunsun !== basaDonAcik) {
      basaDonAcik = gorunsun;
      dom.basaDon.hidden = !gorunsun;
    }
  }, { passive: true });

  dom.reyonSerit.addEventListener('scroll', seritSoluklugu, { passive: true });
  window.addEventListener('resize', seritSoluklugu);

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
    const alan = hedef.closest('.kart-gorsel-alan, .detay-gorsel-alan');
    if (alan) alan.classList.add('gorsel-yok');
  }, true);

  }   /* olaylariBagla sonu */

  /* ---------------- açılış ----------------
     Veri ağdan geldiği için sayfa üç durumdan birinde olabilir:
     yükleniyor, hata, hazır. Üçünde de kullanıcı ne olduğunu görmeli —
     boş beyaz ekran bırakmıyoruz. */

  function yukleniyorGoster() {
    dom.izgara.hidden = false;
    dom.bos.hidden = true;
    dom.izgara.innerHTML =
      '<p class="izgara-durum" role="status">Katalog yükleniyor…</p>';
  }

  function hataGoster(sebep) {
    dom.izgara.hidden = false;
    dom.bos.hidden = true;
    dom.izgara.innerHTML = `
      <div class="izgara-durum izgara-hata" role="alert">
        <p class="bos-baslik">Katalog yüklenemedi.</p>
        <p class="bos-alt">
          Ürün listesi ne canlı katalogdan (<code>${kacar(API_ADRESI)}</code>)
          ne de yedekten (<code>${kacar(YEDEK_ADRESI)}</code>) getirilebildi.
          Bağlantını kontrol edip tekrar deneyebilirsin.
        </p>
        <p class="hata-sebep">${kacar(sebep)}</p>
        <button class="dugme dugme-dolu" id="tekrar-dene" type="button">Tekrar dene</button>
      </div>`;

    // Veri yokken bu bölümlerin gösterecek bir şeyi yok
    dom.firsatBolum.hidden = true;
    dom.firsatBaglanti.hidden = true;
    dom.gunun.hidden = true;
    dom.katalogOzet.hidden = true;
    dom.ayakReyonSutun.hidden = true;   // yoksa başlığı boş listeyle asılı kalır

    // Kontroller görünür ama işe yaramaz durumdaydı; tıklanabilir bırakmayalım
    araclariKilitle(true);

    el('tekrar-dene').addEventListener('click', baslat, { once: true });
  }

  function araclariKilitle(kilit) {
    [dom.arama, dom.siralama, dom.indirimSuzgec, dom.fiyatMin, dom.fiyatMax]
      .forEach((e) => { e.disabled = kilit; });
  }

  async function kaynaktanOku(adres) {
    const yanit = await fetch(adres, { cache: 'no-cache' });
    if (!yanit.ok) throw new Error(`${adres} → ${yanit.status}`);

    const veri = await yanit.json();
    if (!Array.isArray(veri.urunler) || !Array.isArray(veri.reyonlar)) {
      throw new Error(`${adres} → beklenen yapıda değil`);
    }
    return veri;
  }

  // Önce canlı katalog, olmazsa dosya yedeği. Yedek eski olabilir ama
  // hiç ürün göstermemekten iyidir — kullanıcıya da bunu söylüyoruz.
  async function veriGetir() {
    try {
      const veri = await kaynaktanOku(API_ADRESI);
      return { veri, yedekMi: false };
    } catch (apiHatasi) {
      try {
        const veri = await kaynaktanOku(YEDEK_ADRESI);
        return { veri, yedekMi: true, apiSebep: apiHatasi.message };
      } catch (yedekHatasi) {
        throw new Error(`${apiHatasi.message} · ${yedekHatasi.message}`);
      }
    }
  }

  /* Yedeğe düşüldüğünde gösterilen not.

     Tarihi yazıyoruz: tarihsiz bir "güncel olmayabilir" uyarısında bir
     günlük veri ile bir aylık veri aynı görünüyor. Kullanıcı ne kadar
     eskiye baktığını bilmeli.

     Damga okunamazsa genel metne düşüyoruz — yanlış tarih göstermek,
     tarih göstermemekten kötü. */
  function yedekNotu(goster, damga) {
    let not = el('yedek-notu');
    if (!goster) { if (not) not.remove(); return; }
    if (not) return;

    let metin = 'Canlı katalog şu an okunamadı, kayıtlı son kopya gösteriliyor.';
    const t = damga ? new Date(damga) : null;
    if (t && !isNaN(t)) {
      const gun = t.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
      const gecenGun = Math.floor((Date.now() - t.getTime()) / 86400000);
      const yas = gecenGun >= 1 ? ` (${gecenGun} gün önce)` : '';
      metin = `Bu fiyatlar <time datetime="${kacar(damga)}">${gun}</time> itibarıyla${yas}. ` +
              'Canlı katalog okunamadı, kayıtlı son kopya gösteriliyor.';
    }

    not = document.createElement('p');
    not.id = 'yedek-notu';
    not.className = 'yedek-notu';
    not.setAttribute('role', 'status');
    not.innerHTML = '<strong>Fiyatlar güncel olmayabilir.</strong> ' + metin;
    dom.katalogBolum.querySelector('.katalog-ust').after(not);
  }

  let olaylarBagli = false;

  async function baslat() {
    yukleniyorGoster();
    try {
      const { veri, yedekMi, apiSebep } = await veriGetir();

      REYONLAR = veri.reyonlar;
      URUNLER = veri.urunler;
      GUNCELLENDI = veri.guncellendi || null;

      if (yedekMi) console.warn('Canlı katalog okunamadı, yedeğe düşüldü:', apiSebep);
      yedekNotu(yedekMi, veri.guncellendi);

      endeksleriKur();

      // Hata ekranında gizlediklerimizi geri aç (tekrar dene yolu için)
      dom.katalogOzet.hidden = false;
      dom.firsatBolum.hidden = false;
      dom.firsatBaglanti.hidden = false;
      dom.gunun.hidden = false;
      dom.ayakReyonSutun.hidden = false;
      araclariKilitle(false);

      urldenOku();
      veriTarihiCiz();
      reyonlariCiz();
      vitrinCiz();
      katalogCiz();
      detaySenkron();   // ?urun= ile açılan bağlantı doğrudan pencereyi açsın

      if (!olaylarBagli) { olaylariBagla(); olaylarBagli = true; }
    } catch (e) {
      hataGoster(e && e.message ? e.message : String(e));
    }
  }

  baslat();
})();
