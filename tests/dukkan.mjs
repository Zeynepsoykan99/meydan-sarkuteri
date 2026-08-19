/* Dükkân bilgileri bölümü — saat mantığı, dayanıklılık, ölçüler. */
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';

const B = process.env.ADRES || 'http://localhost:3000';
const KOK = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '');
const CIKTI = `${KOK}/.gorsel`;
const VERI = `${KOK}/data/dukkan.json`;
const GIZLI = `${KOK}/data/dukkan.json.gizli`;
const CHROME = process.env.CHROME_YOLU || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

let g = 0, k = 0;
const ok = (m) => { console.log(`  ✓ ${m}`); g++; };
const no = (m) => { console.log(`  ✗ ${m}`); k++; };
const bolum = (t) => console.log(`\n${'═'.repeat(62)}\n${t}\n${'═'.repeat(62)}`);

const OZGUN = readFileSync(VERI);
const yaz = (o) => writeFileSync(VERI, JSON.stringify(o, null, 2), 'utf8');
const oku = () => { const v = JSON.parse(OZGUN.toString('utf8')); v.dolduruldu = true; return v; };
/* Bayrak senaryosu özgün dosyaya bağlı olmamalı: dosya artık gerçek
   bilgilerle dolu ve dolduruldu:true. Kapalı hâli açıkça kuruyoruz. */
const okuKapali = () => {
  const v = JSON.parse(OZGUN.toString('utf8'));
  v.dolduruldu = false;
  v.ad = 'DOLDURULACAK — dükkânın tam adı';
  v.adres = { satir: 'DOLDURULACAK — cadde', ilce: 'DOLDURULACAK', il: 'DOLDURULACAK', haritaUrl: '' };
  return v;
};

const KONTRAST = `(() => {
  const lum = (r) => { const [a,b,c] = r.match(/\\d+(\\.\\d+)?/g).slice(0,3).map(Number);
    const f = (v) => { v/=255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); };
    return 0.2126*f(a) + 0.7152*f(b) + 0.0722*f(c); };
  window.__k = (on, arka) => { const a = lum(on), b = lum(arka);
    return Math.round(((Math.max(a,b)+0.05)/(Math.min(a,b)+0.05))*100)/100; };
})()`;

const t = await chromium.launch({ executablePath: CHROME, headless: true });
async function ac(en = 375, boy = 800) {
  const c = await t.newContext({ viewport: { width: en, height: boy } });
  const s = await c.newPage();
  const hata = [];
  s.on('pageerror', (e) => hata.push(e.message));
  await s.goto(B, { waitUntil: 'networkidle', timeout: 60000 });
  await s.waitForTimeout(900);
  return { c, s, hata };
}

try {
  /* ═══════ 1. Saat mantığı — saf fonksiyon, sahte tarihle ═══════ */
  bolum('1 — Açık/kapalı hesabı (sahte saatlerle, Türkiye saati)');
  {
    const { c, s } = await ac(1280);
    const SAAT = [
      { gunler: 'Pazartesi – Cumartesi', acilis: '08:00', kapanis: '21:00' },
      { gunler: 'Pazar', acilis: '09:00', kapanis: '20:00' },
    ];
    // UTC anları → İstanbul UTC+3
    const durumlar = await s.evaluate(([saatler]) => {
      const dene = (utc) => {
        const d = window.Dukkan.durumHesapla(saatler, new Date(utc));
        const z = window.Dukkan.istanbulZamani(new Date(utc));
        return { utc, gun: z.gun, dk: z.dakika, acik: d && d.acik, metin: d && d.metin, ayrinti: d && d.ayrinti };
      };
      return [
        dene('2026-08-17T09:00:00Z'), // Pzt 12:00 → açık
        dene('2026-08-17T04:30:00Z'), // Pzt 07:30 → kapalı, bugün 08:00
        dene('2026-08-17T18:30:00Z'), // Pzt 21:30 → kapalı, yarın 08:00
        dene('2026-08-22T18:30:00Z'), // Cmt 21:30 → kapalı, yarın 09:00 (pazar)
        dene('2026-08-23T18:30:00Z'), // Paz 21:30 → kapalı, yarın 08:00
        dene('2026-08-23T09:00:00Z'), // Paz 12:00 → açık
        dene('2026-08-23T05:30:00Z'), // Paz 08:30 → kapalı (pazar 09:00 açılır)
        dene('2026-08-17T21:30:00Z'), // Salı 00:30 → kapalı, bugün 08:00
      ];
    }, [SAAT]);

    const GUN = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
    const bekle = [
      [true, ''], [false, 'Bugün 08:00\'de açılır'], [false, 'Yarın 08:00\'de açılır'],
      [false, 'Yarın 09:00\'da açılır'], [false, 'Yarın 08:00\'de açılır'],
      [true, ''], [false, 'Bugün 09:00\'da açılır'], [false, 'Bugün 08:00\'de açılır'],
    ];
    durumlar.forEach((d, i) => {
      const sa = `${String(Math.floor(d.dk / 60)).padStart(2, '0')}:${String(d.dk % 60).padStart(2, '0')}`;
      const [bAcik, bAyrinti] = bekle[i];
      const dogru = d.acik === bAcik && (bAyrinti === '' || d.ayrinti === bAyrinti);
      console.log(`     ${GUN[d.gun]} ${sa} → ${d.metin}${d.ayrinti ? ' · ' + d.ayrinti : ''}`);
      dogru ? ok(`  ${GUN[d.gun]} ${sa} doğru`) : no(`  beklenen ${bAcik ? 'açık' : bAyrinti}, gelen ${d.acik ? 'açık' : d.ayrinti}`);
    });

    /* gece yarısını aşan saat */
    const gece = await s.evaluate(() => {
      const S = [{ gunler: 'Pazartesi – Pazar', acilis: '22:00', kapanis: '02:00' }];
      const d = (utc) => { const r = window.Dukkan.durumHesapla(S, new Date(utc)); return r && r.acik; };
      return {
        yirmiUc: d('2026-08-17T20:00:00Z'),  // Pzt 23:00 → açık
        birBucuk: d('2026-08-17T22:30:00Z'), // Salı 01:30 → açık (dünkü aralık)
        ucBucuk: d('2026-08-18T00:30:00Z'),  // Salı 03:30 → kapalı
      };
    });
    console.log(`     gece yarısı: 23:00=${gece.yirmiUc} 01:30=${gece.birBucuk} 03:30=${gece.ucBucuk}`);
    (gece.yirmiUc && gece.birBucuk && !gece.ucBucuk)
      ? ok('gece yarısı geçişi doğru (22:00–02:00)') : no('gece yarısı yanlış');

    /* cihaz saat dilimi etkilemiyor */
    const c2 = await t.newContext({ viewport: { width: 1280, height: 800 }, timezoneId: 'America/New_York' });
    const s2 = await c2.newPage();
    await s2.goto(B, { waitUntil: 'networkidle', timeout: 60000 });
    await s2.waitForTimeout(700);
    const ny = await s2.evaluate(() => {
      const S = [{ gunler: 'Pazartesi – Cumartesi', acilis: '08:00', kapanis: '21:00' }];
      const z = window.Dukkan.istanbulZamani(new Date('2026-08-17T09:00:00Z'));
      return { z, acik: window.Dukkan.durumHesapla(S, new Date('2026-08-17T09:00:00Z')).acik,
               cihaz: Intl.DateTimeFormat().resolvedOptions().timeZone };
    });
    console.log(`     cihaz TZ: ${ny.cihaz} → İstanbul ${Math.floor(ny.z.dakika / 60)}:00, açık=${ny.acik}`);
    (ny.z.dakika === 720 && ny.acik) ? ok('New York cihazında da Türkiye saati kullanılıyor') : no('cihaz saatine kaymış');
    await c2.close();

    /* saat verisi yoksa gösterge yok */
    const bos = await s.evaluate(() => [
      window.Dukkan.durumHesapla(undefined),
      window.Dukkan.durumHesapla([]),
      window.Dukkan.durumHesapla([{ gunler: 'Zamazingo', acilis: '08:00', kapanis: '21:00' }]),
      window.Dukkan.durumHesapla([{ gunler: 'Pazar', acilis: 'abc', kapanis: '21:00' }]),
    ]);
    bos.every((x) => x === null) ? ok('saat verisi eksik/bozukken gösterge null') : no(`${JSON.stringify(bos)}`);
    await c.close();
  }

  /* ═══════ 2. Bağlantı biçimleri ═══════ */
  bolum('2 — tel: ve wa.me biçimleri');
  {
    const { c, s } = await ac(1280);
    const r = await s.evaluate(() => ({
      tel1: window.Dukkan.telAdresi('+90 555 123 45 67'),
      tel2: window.Dukkan.telAdresi('0555 123 45 67'),
      wa1: window.Dukkan.whatsappAdresi('+90 555 123 45 67', 'Merhaba'),
      wa2: window.Dukkan.whatsappAdresi('0555 123 45 67', 'Merhaba'),
      wa3: window.Dukkan.whatsappAdresi('00905551234567', null),
      waKisa: window.Dukkan.whatsappAdresi('123', 'x'),
    }));
    console.log(`     ${JSON.stringify(r, null, 2).replace(/\n/g, '\n     ')}`);
    r.tel1 === 'tel:+905551234567' ? ok('tel: uluslararası biçim korunuyor') : no(r.tel1);
    r.tel2 === 'tel:05551234567' ? ok('tel: yerel numara olduğu gibi') : no(r.tel2);
    r.wa1 === 'https://wa.me/905551234567?text=Merhaba' ? ok('wa.me + hazır mesaj') : no(r.wa1);
    r.wa2 === 'https://wa.me/905551234567?text=Merhaba' ? ok('0 ile başlayan numara 90 ile düzeltiliyor') : no(r.wa2);
    r.wa3 === 'https://wa.me/905551234567' ? ok('00 öneki temizleniyor') : no(r.wa3);
    r.waKisa === null ? ok('geçersiz numarada bağlantı üretilmiyor') : no(`${r.waKisa}`);
    await c.close();
  }

  /* ═══════ 3. Dayanıklılık ═══════ */
  bolum('3 — Eksik/bozuk veriye dayanıklılık');

  // 3a: dosya yok
  renameSync(VERI, GIZLI);
  {
    const { c, s, hata } = await ac(1280);
    const r = await s.evaluate(() => ({
      serit: !document.getElementById('dukkan-serit').hidden,
      bolum: !document.getElementById('dukkan').hidden,
      kart: document.querySelectorAll('#izgara .kart').length,
    }));
    console.log(`     dosya yok → şerit:${r.serit} bölüm:${r.bolum} kart:${r.kart}`);
    (!r.serit && !r.bolum) ? ok('dosya yokken ikisi de gizli') : no('görünüyor');
    r.kart === 470 ? ok('katalog etkilenmedi (470 kart)') : no(`${r.kart} kart`);
    hata.length === 0 ? ok('JS hatası yok') : no(`${hata.length}: ${hata.join(' | ')}`);
    await c.close();
  }
  renameSync(GIZLI, VERI);

  // 3b: bozuk JSON
  writeFileSync(VERI, '{ bu gecerli json degil ', 'utf8');
  {
    const { c, s, hata } = await ac(1280);
    const r = await s.evaluate(() => ({
      serit: !document.getElementById('dukkan-serit').hidden,
      bolum: !document.getElementById('dukkan').hidden,
      kart: document.querySelectorAll('#izgara .kart').length,
    }));
    (!r.serit && !r.bolum && r.kart === 470) ? ok('bozuk JSON sayfayı bozmuyor') : no(JSON.stringify(r));
    hata.length === 0 ? ok('JS hatası yok') : no(`${hata.length}: ${hata.join(' | ')}`);
    await c.close();
  }

  // 3c: alan alan boş
  const v = oku();
  v.iletisim = { telefon: '', whatsapp: '' };
  v.adres.haritaUrl = '';
  yaz(v);
  {
    const { c, s, hata } = await ac(375);
    const r = await s.evaluate(() => ({
      seritDugme: document.querySelectorAll('#dukkan-serit .serit-dugme').length,
      wa: document.querySelectorAll('.dukkan-dugme-wa, .serit-dugme-wa').length,
      tel: document.querySelectorAll('a[href^="tel:"]').length,
      harita: document.querySelectorAll('.dukkan-baglanti').length,
      kutu: document.querySelectorAll('.dukkan-kutu h3').length,
      basliklar: [...document.querySelectorAll('.dukkan-kutu h3')].map((e) => e.textContent),
      seritGorunur: !document.getElementById('dukkan-serit').hidden,
    }));
    console.log(`     iletişim boş → ${JSON.stringify(r)}`);
    r.wa === 0 ? ok('WhatsApp yoksa düğme çıkmıyor') : no(`${r.wa} WhatsApp düğmesi`);
    r.tel === 0 ? ok('telefon yoksa tel: bağlantısı çıkmıyor') : no(`${r.tel} tel bağlantısı`);
    r.harita === 0 ? ok('haritaUrl boşken bağlantı çıkmıyor') : no('harita bağlantısı var');
    !r.basliklar.includes('İletişim') ? ok('İletişim kutusu hiç çizilmiyor') : no('boş kutu duruyor');
    r.seritGorunur ? ok('şerit yine görünüyor (durum var)') : no('şerit kayboldu');
    hata.length === 0 ? ok('JS hatası yok') : no(`${hata.length}`);
    await c.close();
  }

  // 3d: saatler yok, iletişim var
  const v2 = oku();
  v2.saatler = [];
  v2.iletisim = { telefon: '+90 555 123 45 67', whatsapp: '+90 555 123 45 67' };
  yaz(v2);
  {
    const { c, s, hata } = await ac(375);
    const r = await s.evaluate(() => ({
      durum: document.querySelectorAll('.serit-durum, .dukkan-durum').length,
      saatKutu: [...document.querySelectorAll('.dukkan-kutu h3')].some((e) => /saat/i.test(e.textContent)),
      wa: document.querySelectorAll('.dukkan-dugme-wa').length,
    }));
    console.log(`     saat yok → ${JSON.stringify(r)}`);
    r.durum === 0 ? ok('saat yoksa açık/kapalı göstergesi hiç çıkmıyor') : no(`${r.durum} gösterge`);
    !r.saatKutu ? ok('saat kutusu çizilmiyor') : no('boş saat kutusu var');
    r.wa === 1 ? ok('iletişim yine çalışıyor') : no('WhatsApp yok');
    hata.length === 0 ? ok('JS hatası yok') : no(`${hata.length}`);
    await c.close();
  }

  /* ═══════ 3e. dolduruldu:false — bayrak koruması ═══════ */
  bolum('3e — dolduruldu:false iken hiçbir şey gösterilmiyor');
  yaz(okuKapali());
  {
    const c = await t.newContext({ viewport: { width: 375, height: 800 } });
    const s = await c.newPage();
    const hata = [], uyari = [];
    s.on('pageerror', (e) => hata.push(e.message));
    s.on('console', (m) => { if (m.type() === 'warning') uyari.push(m.text()); });
    await s.goto(B, { waitUntil: 'networkidle', timeout: 60000 });
    await s.waitForTimeout(900);

    const r = await s.evaluate(() => ({
      serit: !document.getElementById('dukkan-serit').hidden,
      bolum: !document.getElementById('dukkan').hidden,
      kart: document.querySelectorAll('#izgara .kart').length,
      ust: document.querySelector('.acilis span')?.textContent.replace(/\s+/g, ' ').trim(),
      alt: document.querySelector('.ayak-marka p')?.textContent.replace(/\s+/g, ' ').trim(),
      sizinti: document.body.innerText.includes('DOLDURULACAK'),
    }));
    console.log(`     şerit:${r.serit} bölüm:${r.bolum} kart:${r.kart}`);
    console.log(`     üst başlık: "${r.ust}"`);
    console.log(`     altbilgi  : "${r.alt}"`);
    !r.serit ? ok('şerit gizli') : no('şerit görünüyor');
    !r.bolum ? ok('bölüm gizli') : no('bölüm görünüyor');
    r.kart === 470 ? ok('sayfa normal, 470 kart') : no(`${r.kart} kart`);
    !r.sizinti ? ok('sayfada hiçbir yerde "DOLDURULACAK" yok') : no('DOLDURULACAK sızmış');
    // index.html'deki yedek metin artık gerçek bilgiyi taşıyor
    /07:30/.test(r.ust ?? '') ? ok('üst başlık sabit metninde kaldı') : no(`üst: ${r.ust}`);
    /Dikbıyık/.test(r.alt ?? '') ? ok('altbilgi sabit metninde kaldı') : no(`alt: ${r.alt}`);
    const u = uyari.find((x) => /doldurulmad/i.test(x));
    u ? ok(`konsol uyarısı: "${u}"`) : no('konsol uyarısı yok');
    hata.length === 0 ? ok('JS hatası yok') : no(`${hata.length}: ${hata.join(' | ')}`);
    await c.close();
  }

  /* ═══════ 3f. veri-kontrol.js kalıntıyı yakalıyor mu ═══════ */
  bolum('3f — veri-kontrol.js denetimi');
  {
    const { execFileSync } = await import('node:child_process');
    const calistir = () => {
      try { return { kod: 0, cikti: execFileSync('node', ['scripts/veri-kontrol.js'], { cwd: KOK, encoding: 'utf8' }) }; }
      catch (e) { return { kod: e.status, cikti: (e.stdout || '') + (e.stderr || '') }; }
    };

    yaz(okuKapali());
    let r = calistir();
    const uy = r.cikti.split('\n').find((x) => /doldurulmad/i.test(x)) || '';
    (r.kod === 0 && uy) ? ok('dolduruldu:false → uyarı var, hata yok') : no(`kod ${r.kod}`);

    const kalintili = okuKapali(); kalintili.dolduruldu = true;   // bayrak açık, kalıntı duruyor
    yaz(kalintili);
    r = calistir();
    const hs = r.cikti.split('\n').find((x) => /DOLDURULACAK/.test(x)) || '';
    (r.kod === 1 && hs) ? ok('kalıntı yakalandı, çıkış kodu 1') : no(`kod ${r.kod}: ${r.cikti.slice(-200)}`);
    if (hs) console.log(`       ${hs.trim()}`);

    const telsiz = oku();
    telsiz.ad = 'Meydan Şarküteri';
    telsiz.adres = { satir: 'Cumhuriyet Meydanı No: 7', ilce: 'Karşıyaka', il: 'İzmir', haritaUrl: '' };
    telsiz.siparis = { var: true, yontem: 'whatsapp', aciklama: 'Sipariş açıklaması', teslimat: 'Teslimat notu' };
    telsiz.iletisim = { telefon: '', whatsapp: '' };
    yaz(telsiz);
    r = calistir();
    (r.kod === 1 && /telefon boş/.test(r.cikti)) ? ok('boş telefon yakalandı') : no(`kod ${r.kod}`);

    // veri-kontrol.js artık index.html VE afis.html'deki elle yazılmış
    // metinlerle senkronu denetliyor; "geçerli dosya" senaryosu gerçek
    // adres/saat/telefonu korumalı. WhatsApp sahte olabilir: afişte yok.
    const tam = oku();
    tam.iletisim = { ...tam.iletisim, whatsapp: '+90 555 123 45 67' };
    tam.adres.haritaUrl = 'https://maps.google.com/?q=test';
    yaz(tam);
    r = calistir();
    (r.kod === 0 && /bütün kontroller geçti/.test(r.cikti)) ? ok('doğru doldurulmuş dosya geçiyor') : no(`kod ${r.kod}: ${r.cikti.slice(-250)}`);
  }


  /* ═══════ 4. Dolu veriyle görünüm, ölçüler, kontrast ═══════ */
  bolum('4 — Dolu veriyle: ölçüler, kontrast, taşma');
  const dolu = oku();
  dolu.ad = 'Meydan Şarküteri';
  dolu.adres = { satir: 'Cumhuriyet Meydanı No: 7', ilce: 'Karşıyaka', il: 'İzmir',
                 haritaUrl: 'https://maps.google.com/?q=Cumhuriyet+Meydani+7+Karsiyaka' };
  dolu.iletisim = { telefon: '+90 232 123 45 67', whatsapp: '+90 555 123 45 67' };
  dolu.siparis = { var: true, yontem: 'whatsapp',
                   aciklama: 'WhatsApp\'tan yazın, hazırlayıp haber verelim.',
                   teslimat: 'Mahalle içi 150 TL üzeri ücretsiz teslimat.' };
  yaz(dolu);

  for (const en of [320, 375, 1280]) {
    console.log(`\n  --- ${en}px ---`);
    const { c, s, hata } = await ac(en, en === 1280 ? 900 : 800);
    await s.evaluate(KONTRAST);

    const r = await s.evaluate(() => {
      const de = document.documentElement;
      const kucuk = [];
      document.querySelectorAll('#dukkan-serit a, #dukkan a').forEach((a) => {
        const b = a.getBoundingClientRect();
        if (b.height < 44) kucuk.push(`${a.textContent.trim().slice(0, 14)} ${Math.round(b.height)}px`);
      });
      const serit = document.getElementById('dukkan-serit');
      const durumE = serit.querySelector('.serit-durum strong');
      const seritArka = getComputedStyle(serit).backgroundColor;
      return {
        tasma: de.scrollWidth > de.clientWidth, w: de.scrollWidth, cw: de.clientWidth,
        seritTasma: serit.scrollWidth > serit.clientWidth,
        kucuk,
        kutu: document.querySelectorAll('.dukkan-kutu').length,
        durumMetin: durumE ? durumE.textContent : null,
        durumKontrast: durumE ? window.__k(getComputedStyle(durumE).color, seritArka) : null,
        ayrintiKontrast: (() => { const e = serit.querySelector('.serit-ayrinti');
          return e ? window.__k(getComputedStyle(e).color, seritArka) : null; })(),
        waKontrast: (() => { const e = document.querySelector('.dukkan-dugme-wa');
          return e ? window.__k(getComputedStyle(e).color, getComputedStyle(e).backgroundColor) : null; })(),
        saatKontrast: (() => { const e = document.querySelector('.saat-gun');
          return e ? window.__k(getComputedStyle(e).color, getComputedStyle(e.closest('.dukkan-kutu')).backgroundColor) : null; })(),
        telHref: document.querySelector('#dukkan a[href^="tel:"]')?.getAttribute('href'),
        waHref: document.querySelector('.dukkan-dugme-wa')?.getAttribute('href'),
      };
    });
    console.log(`     sayfa ${r.w}/${r.cw}, kutu ${r.kutu}, durum "${r.durumMetin}"`);
    !r.tasma ? ok('yatay taşma yok') : no(`TAŞMA ${r.w}/${r.cw}`);
    !r.seritTasma ? ok('şerit taşmıyor') : no('şerit taşıyor');
    r.kucuk.length === 0 ? ok('tüm bağlantılar ≥44px') : no(`küçük: ${r.kucuk.join(', ')}`);
    r.kutu === 4 ? ok('dört kutu da çizildi') : no(`${r.kutu} kutu`);
    console.log(`     kontrast — durum ${r.durumKontrast}:1, ayrıntı ${r.ayrintiKontrast}:1, WhatsApp ${r.waKontrast}:1, saat ${r.saatKontrast}:1`);
    [['durum', r.durumKontrast], ['şerit ayrıntı', r.ayrintiKontrast],
     ['WhatsApp', r.waKontrast], ['saat etiketi', r.saatKontrast]].forEach(([ad, o]) => {
      o >= 4.5 ? ok(`${ad} kontrastı AA (${o}:1)`) : no(`${ad} kontrastı ${o}:1 < 4.5`);
    });
    if (en === 375) {
      r.telHref === 'tel:+902321234567' ? ok(`tel: doğru (${r.telHref})`) : no(`${r.telHref}`);
      /^https:\/\/wa\.me\/905551234567\?text=/.test(r.waHref) ? ok('wa.me doğru + hazır mesaj') : no(`${r.waHref}`);
      await s.evaluate(() => document.getElementById('dukkan').scrollIntoView({ block: 'start' }));
      await s.waitForTimeout(500);
      await s.screenshot({ path: `${CIKTI}/telefon-dukkan-bolumu.png`, fullPage: false });
      await s.evaluate(() => window.scrollTo(0, 0));
      await s.waitForTimeout(300);
      await s.screenshot({ path: `${CIKTI}/telefon-dukkan-serit.png` });
      console.log(`     görüntüler alındı`);
    }
    hata.length === 0 ? ok('JS hatası yok') : no(`${hata.length}: ${hata.join(' | ')}`);
    await c.close();
  }
} finally {
  if (existsSync(GIZLI)) renameSync(GIZLI, VERI);
  writeFileSync(VERI, OZGUN);
  readFileSync(VERI).equals(OZGUN) ? ok('data/dukkan.json bayt bayt geri kondu') : no('DOSYA GERİ KONAMADI');
  await t.close();
}

console.log(`\n${'═'.repeat(62)}\nSONUÇ: ${g} geçti, ${k} kaldı`);
process.exit(k === 0 ? 0 : 1);
