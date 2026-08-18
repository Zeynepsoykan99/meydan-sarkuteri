/* =====================================================================
   Dükkân bilgileri — adres, saatler, iletişim, sipariş.

   Veri data/dukkan.json'dan geliyor, veritabanından DEĞİL: yılda bir
   kez değişiyor, panelden düzenlenmiyor, ve dosyada durunca veritabanı
   düşse bile bu bölüm görünmeye devam ediyor.

   Eksik alana dayanıklı: bir alan boş ya da yoksa o parça hiç
   çizilmiyor. Dosya hiç okunamazsa bölüm de şerit de çıkmıyor, sayfanın
   geri kalanı etkilenmiyor.
   ===================================================================== */

window.Dukkan = (function () {
  'use strict';

  const { kacar } = window.Ortak;
  const ADRES = 'data/dukkan.json';

  /* ---------------- gün ve saat çözümleme ---------------- */

  // JS getDay() sırası: 0 pazar … 6 cumartesi
  const GUN_ADI = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  const GUN_INDEKS = {
    pazar: 0, pazartesi: 1, sali: 2, carsamba: 3, persembe: 4, cuma: 5, cumartesi: 6,
  };

  const sade = (s) => String(s).toLocaleLowerCase('tr')
    .replace(/[ıîi̇]/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c').trim();

  /** "Pazartesi – Cumartesi" → [1,2,3,4,5,6]; "Pazar" → [0]; liste de olur. */
  function gunleriCoz(metin) {
    if (typeof metin !== 'string' || !metin.trim()) return [];
    const aralik = metin.split(/\s*[–—-]\s*/);
    if (aralik.length === 2) {
      const a = GUN_INDEKS[sade(aralik[0])], b = GUN_INDEKS[sade(aralik[1])];
      if (a === undefined || b === undefined) return [];
      const cikti = [];
      for (let i = 0, g = a; i < 7; i++, g = (g + 1) % 7) {
        cikti.push(g);
        if (g === b) return cikti;         // haftayı aşan aralık da çalışıyor
      }
      return cikti;
    }
    return metin.split(/\s*(?:,|ve)\s*/i)
      .map((p) => GUN_INDEKS[sade(p)])
      .filter((x) => x !== undefined);
  }

  /** "08:00" → 480. Bozuksa null. */
  function dakikaya(metin) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(metin ?? '').trim());
    if (!m) return null;
    const sa = Number(m[1]), dk = Number(m[2]);
    if (sa > 23 || dk > 59) return null;
    return sa * 60 + dk;
  }

  const saatYazi = (dk) =>
    `${String(Math.floor(dk / 60)).padStart(2, '0')}:${String(dk % 60).padStart(2, '0')}`;

  /* Saatin bulunma hâli eki: 08:00'de, 09:00'da, 13:00'te.
     Saat 0–23 kapalı bir küme, tablo taşamaz. */
  function saatEki(dk) {
    const sa = Math.floor(dk / 60);
    if (sa === 0 || sa === 10) return 'da';
    if (sa === 20) return 'de';
    return { 1: 'de', 2: 'de', 3: 'te', 4: 'te', 5: 'te',
             6: 'da', 7: 'de', 8: 'de', 9: 'da' }[sa % 10] ?? 'de';
  }

  /** Kuralları güne göre aralıklara açar. Gece yarısını aşan saatler
      ertesi güne taşınıyor (22:00–02:00 gibi). */
  function araliklar(saatler) {
    const liste = [];
    for (const k of Array.isArray(saatler) ? saatler : []) {
      const gunler = gunleriCoz(k && k.gunler);
      const bas = dakikaya(k && k.acilis);
      const son = dakikaya(k && k.kapanis);
      if (!gunler.length || bas === null || son === null || bas === son) continue;
      for (const g of gunler) {
        if (son > bas) liste.push({ gun: g, bas, son, devam: false });
        else {
          liste.push({ gun: g, bas, son: 1440, devam: false });
          liste.push({ gun: (g + 1) % 7, bas: 0, son, devam: true });
        }
      }
    }
    return liste;
  }

  /* ---------------- Türkiye saati ----------------
     Ziyaretçinin cihaz saat dilimine GÜVENMİYORUZ: yurt dışındaki biri
     kendi saatine göre "kapalı" görmesin. Intl ile İstanbul'a çeviriyoruz. */

  const ISTANBUL = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Istanbul',
    weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const KISA_GUN = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  function istanbulZamani(tarih) {
    const p = Object.fromEntries(
      ISTANBUL.formatToParts(tarih ?? new Date()).map((x) => [x.type, x.value]));
    return { gun: KISA_GUN[p.weekday], dakika: Number(p.hour) * 60 + Number(p.minute) };
  }

  /* ---------------- açık mı ---------------- */

  /** { acik, kapanis, metin, ayrinti } — saat verisi yoksa null. */
  function durumHesapla(saatler, tarih) {
    const liste = araliklar(saatler);
    if (!liste.length) return null;

    const { gun, dakika } = istanbulZamani(tarih);

    const suan = liste.find((a) => a.gun === gun && dakika >= a.bas && dakika < a.son);
    if (suan) {
      return {
        acik: true,
        kapanis: suan.son >= 1440 ? null : saatYazi(suan.son),
        metin: 'Şu an açık',
        ayrinti: suan.son >= 1440 ? '' : `Kapanış ${saatYazi(suan.son)}`,
      };
    }

    // Kapalı: bir sonraki açılış ne zaman? (devam parçaları açılış sayılmaz)
    for (let d = 0; d < 8; d++) {
      const g = (gun + d) % 7;
      const adaylar = liste
        .filter((a) => a.gun === g && !a.devam && (d > 0 || a.bas > dakika))
        .map((a) => a.bas)
        .sort((x, y) => x - y);
      if (!adaylar.length) continue;
      const bas = adaylar[0];
      const ne = d === 0 ? 'Bugün' : d === 1 ? 'Yarın' : GUN_ADI[g];
      return {
        acik: false,
        kapanis: null,
        metin: 'Şu an kapalı',
        ayrinti: `${ne} ${saatYazi(bas)}'${saatEki(bas)} açılır`,
      };
    }
    return { acik: false, kapanis: null, metin: 'Şu an kapalı', ayrinti: '' };
  }

  /* ---------------- bağlantılar ---------------- */

  const doluMu = (v) => typeof v === 'string' && v.trim() !== '';

  /** wa.me yalnızca rakam ister; "0555…" ülke koduna çevriliyor. */
  function whatsappNumarasi(ham) {
    let d = String(ham).replace(/\D/g, '');
    if (d.startsWith('00')) d = d.slice(2);
    else if (d.startsWith('0')) d = '90' + d.slice(1);
    return d;
  }

  const telAdresi = (ham) => 'tel:' + String(ham).replace(/[^\d+]/g, '');

  function whatsappAdresi(ham, mesaj) {
    const n = whatsappNumarasi(ham);
    if (n.length < 10) return null;
    const u = `https://wa.me/${n}`;
    return mesaj ? `${u}?text=${encodeURIComponent(mesaj)}` : u;
  }

  /* ---------------- çizim ---------------- */

  const el = (id) => document.getElementById(id);

  function seritCiz(veri, durum) {
    const kap = el('dukkan-serit');
    if (!kap) return;
    const tel = veri.iletisim && veri.iletisim.telefon;
    const wa = veri.iletisim && veri.iletisim.whatsapp;
    const waAdres = doluMu(wa)
      ? whatsappAdresi(wa, `Merhaba, ${veri.ad || 'dükkân'} hakkında bilgi almak istiyorum.`)
      : null;

    const parcalar = [];
    if (durum) {
      parcalar.push(`
        <p class="serit-durum ${durum.acik ? 'acik' : 'kapali'}">
          <span class="durum-nokta" aria-hidden="true"></span>
          <strong>${kacar(durum.metin)}</strong>${durum.ayrinti ? ` <span class="serit-ayrinti">${kacar(durum.ayrinti)}</span>` : ''}
        </p>`);
    }
    const dugmeler = [];
    if (doluMu(tel)) {
      dugmeler.push(`<a class="serit-dugme" href="${kacar(telAdresi(tel))}">
        <span aria-hidden="true">📞</span> Ara</a>`);
    }
    if (waAdres) {
      dugmeler.push(`<a class="serit-dugme serit-dugme-wa" href="${kacar(waAdres)}"
        target="_blank" rel="noopener"><span aria-hidden="true">💬</span> WhatsApp</a>`);
    }
    if (dugmeler.length) parcalar.push(`<div class="serit-dugmeler">${dugmeler.join('')}</div>`);

    if (!parcalar.length) return;                 // gösterecek bir şey yok
    kap.innerHTML = `<div class="kucak serit-ic">${parcalar.join('')}</div>`;
    kap.hidden = false;
  }

  function bolumCiz(veri, durum) {
    const kap = el('dukkan');
    if (!kap) return;

    const kutular = [];

    /* adres */
    const a = veri.adres || {};
    const adresSatirlari = [a.satir, [a.ilce, a.il].filter(doluMu).join(' / ')].filter(doluMu);
    if (adresSatirlari.length) {
      const harita = doluMu(a.haritaUrl)
        ? `<a class="dukkan-baglanti" href="${kacar(a.haritaUrl)}" target="_blank" rel="noopener">
             Haritada göster <span aria-hidden="true">↗</span></a>` : '';
      kutular.push(`
        <div class="dukkan-kutu">
          <h3>Adres</h3>
          <p class="dukkan-adres">${adresSatirlari.map(kacar).join('<br>')}</p>
          ${harita}
        </div>`);
    }

    /* saatler */
    const gecerli = (Array.isArray(veri.saatler) ? veri.saatler : [])
      .filter((k) => gunleriCoz(k && k.gunler).length && dakikaya(k && k.acilis) !== null
                     && dakikaya(k && k.kapanis) !== null);
    if (gecerli.length) {
      const satirlar = gecerli.map((k) => `
        <div class="saat-satir">
          <span class="saat-gun">${kacar(k.gunler)}</span>
          <span class="saat-araligi">${kacar(k.acilis)} – ${kacar(k.kapanis)}</span>
        </div>`).join('');
      kutular.push(`
        <div class="dukkan-kutu">
          <h3>Çalışma saatleri</h3>
          ${durum ? `<p class="dukkan-durum ${durum.acik ? 'acik' : 'kapali'}">
            <span class="durum-nokta" aria-hidden="true"></span>
            <strong>${kacar(durum.metin)}</strong>${durum.ayrinti ? ` · ${kacar(durum.ayrinti)}` : ''}
          </p>` : ''}
          <div class="saat-tablo">${satirlar}</div>
        </div>`);
    }

    /* iletişim */
    const tel = veri.iletisim && veri.iletisim.telefon;
    const wa = veri.iletisim && veri.iletisim.whatsapp;
    const waAdres = doluMu(wa)
      ? whatsappAdresi(wa, `Merhaba, ${veri.ad || 'dükkân'} hakkında bilgi almak istiyorum.`)
      : null;
    if (doluMu(tel) || waAdres) {
      const satirlar = [];
      if (doluMu(tel)) {
        satirlar.push(`<a class="dukkan-dugme" href="${kacar(telAdresi(tel))}">
          <span aria-hidden="true">📞</span> ${kacar(tel)}</a>`);
      }
      if (waAdres) {
        satirlar.push(`<a class="dukkan-dugme dukkan-dugme-wa" href="${kacar(waAdres)}"
          target="_blank" rel="noopener"><span aria-hidden="true">💬</span> WhatsApp'tan yaz</a>`);
      }
      kutular.push(`
        <div class="dukkan-kutu">
          <h3>İletişim</h3>
          <div class="dukkan-dugmeler">${satirlar.join('')}</div>
        </div>`);
    }

    /* sipariş ve ödeme */
    const sip = veri.siparis || {};
    const odeme = (Array.isArray(veri.odeme) ? veri.odeme : []).filter(doluMu);
    const sipParca = [];
    if (sip.var && (doluMu(sip.aciklama) || doluMu(sip.teslimat))) {
      if (doluMu(sip.aciklama)) sipParca.push(`<p>${kacar(sip.aciklama)}</p>`);
      if (doluMu(sip.teslimat)) sipParca.push(`<p class="dukkan-ikincil">${kacar(sip.teslimat)}</p>`);
    }
    if (odeme.length) {
      sipParca.push(`<p class="dukkan-odeme">${odeme.map((o) =>
        `<span class="odeme-etiket">${kacar(o)}</span>`).join('')}</p>`);
    }
    if (sipParca.length) {
      kutular.push(`
        <div class="dukkan-kutu">
          <h3>${sip.var ? 'Sipariş ve ödeme' : 'Ödeme'}</h3>
          ${sipParca.join('')}
        </div>`);
    }

    if (!kutular.length) return;
    kap.innerHTML = `
      <div class="kucak">
        <div class="bolum-baslik">
          <h2>${kacar(veri.ad || 'Dükkân')}</h2>
          <p>Adres, çalışma saatleri ve iletişim.</p>
        </div>
        <div class="dukkan-izgara">${kutular.join('')}</div>
      </div>`;
    kap.hidden = false;
  }

  /* Başlıktaki ve altbilgideki sabit metinler bu veriyle çelişmesin.
     Veri yoksa dokunmuyoruz, sayfada yazan kalıyor. */
  function sabitMetinleriTazele(veri) {
    const a = veri.adres || {};
    const kisaAdres = doluMu(a.satir) ? a.satir : '';
    const gecerli = (Array.isArray(veri.saatler) ? veri.saatler : [])
      .filter((k) => dakikaya(k && k.acilis) !== null && dakikaya(k && k.kapanis) !== null);
    const kisaSaat = gecerli.length === 1
      ? `${gecerli[0].gunler} ${gecerli[0].acilis} – ${gecerli[0].kapanis}`
      : gecerli.length > 1 ? 'Çalışma saatleri aşağıda' : '';

    // Başlıktaki <strong> blok öğe gibi duruyor; ikinci satır ayrı bir
    // <span> olmalı, yoksa iki metin bitişik yazılıyor.
    const ust = document.querySelector('.acilis span');
    if (ust && (kisaSaat || kisaAdres)) {
      ust.innerHTML =
        (kisaSaat ? `<strong>${kacar(kisaSaat)}</strong>` : '') +
        (kisaAdres ? `<span class="acilis-adres">${kacar(kisaAdres)}</span>` : '');
    }
    const alt = document.querySelector('.ayak-marka p');
    if (alt && (kisaAdres || kisaSaat)) {
      alt.innerHTML = `<strong>${kacar(veri.ad || 'Meydan Şarküteri')}</strong><br>` +
        [kisaAdres, kisaSaat].filter(Boolean).map(kacar).join(' · ');
    }
  }

  /* ---------------- açılış ---------------- */

  async function baslat() {
    let veri;
    try {
      const y = await fetch(ADRES, { cache: 'no-cache' });
      if (!y.ok) throw new Error(String(y.status));
      veri = await y.json();
      if (!veri || typeof veri !== 'object') throw new Error('biçim');
    } catch {
      return;               // dosya yok ya da bozuk: bölüm hiç çıkmaz
    }
    /* Örnek saatler çalışır değerler taşıyor: bayrak olmasaydı dosya
       doldurulmadan yayına giderse ziyaretçi YANLIŞ saat görürdü ve
       hiçbir yerde "DOLDURULACAK" yazmazdı. Bayrak açılmadan tek satır
       bile çizmiyoruz; başlık ve altbilgi de sayfadaki sabit metinde
       kalıyor. */
    if (veri.dolduruldu !== true) {
      console.warn('dukkan.json henüz doldurulmadı — dükkân bilgileri gösterilmiyor.');
      return;
    }

    const durum = durumHesapla(veri.saatler);
    try { seritCiz(veri, durum); } catch { /* şerit çıkmasın, sayfa dursun */ }
    try { bolumCiz(veri, durum); } catch { /* bölüm çıkmasın, sayfa dursun */ }
    try { sabitMetinleriTazele(veri); } catch { /* eski metin kalsın */ }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', baslat);
  } else {
    baslat();
  }

  // Sınama için: saat hesabı saf, dışarıdan tarih verilebiliyor
  return { durumHesapla, gunleriCoz, dakikaya, whatsappAdresi, telAdresi, istanbulZamani };
})();
