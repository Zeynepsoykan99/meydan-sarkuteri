/* tests/dukkan.mjs'in Next.js sürümü. Kökteki özgün dosya SİLİNMEDİ;
   bu, aynı davranışları Next çıktısı üzerinde doğruluyor.

   Fark: saat mantığı artık sunucuda çalışıyor, tarayıcıya window.Dukkan
   diye bir nesne açılmıyor. O yüzden saf mantık doğrudan lib'den import
   ediliyor; DOM tarafı tarayıcıyla ölçülüyor. */

import { chromium } from "playwright-core";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const B = process.env.ADRES || "http://localhost:3001";
const KOK = fileURLToPath(new URL("..", import.meta.url)).replace(/[\\/]$/, "");
const VERI = join(KOK, "..", "data", "dukkan.json");
const CHROME = process.env.CHROME_YOLU || "C:/Program Files/Google/Chrome/Application/chrome.exe";

let g = 0, k = 0;
const ok = (m) => { console.log(`  ✓ ${m}`); g++; };
const no = (m) => { console.log(`  ✗ ${m}`); k++; };
const bolum = (t) => console.log(`\n${"═".repeat(62)}\n${t}\n${"═".repeat(62)}`);

const OZGUN = readFileSync(VERI);
const KOPYA = join(KOK, "src", "data", "dukkan.json");

/* ═══════ 0. İki dukkan.json ayrışmış mı ═══════ */
bolum("0 — data/dukkan.json: kök ile nextjs kopyası aynı mı");
{
  /* Tek doğruluk kaynağı depo kökündeki data/dukkan.json; nextjs/data/
     altındaki onun prebuild tarafından tazelenen kopyası ve lib/dukkan.ts
     onu MODÜL OLARAK import ediyor. İkisi ayrışırsa site, kökte düzeltilmiş
     bir adresi/saati göstermeye devam etmez — eski kopyayı gösterir ve
     kimse fark etmez. Kopyalama başarısız olursa (Vercel'de Root Directory
     dışına erişim kapalıysa) tam olarak bu olur. */
  let kopyaVar = true;
  let kopyaIcerik = null;
  try {
    kopyaIcerik = readFileSync(KOPYA);
  } catch {
    kopyaVar = false;
  }

  kopyaVar
    ? ok("nextjs/src/data/dukkan.json var (import edilebilir)")
    : no("nextjs/src/data/dukkan.json YOK — lib/dukkan.ts import edemez, derleme kırılır");

  if (kopyaVar) {
    const a = JSON.stringify(JSON.parse(OZGUN.toString("utf8")));
    const b = JSON.stringify(JSON.parse(kopyaIcerik.toString("utf8")));
    a === b
      ? ok("kök data/dukkan.json ile nextjs kopyası AYNI")
      : no("İKİSİ AYRIŞMIŞ — prebuild kopyalaması çalışmamış, site eski veriyi gösteriyor");
  }
}

/* ═══════ 1. Saat mantığı — saf, sunucu tarafı ═══════ */
bolum("1 — Açık/kapalı hesabı (lib/dukkan.ts, Türkiye saati)");
{
  const { durumHesapla, gunleriCoz, saatEki, istanbulZamani,
          telAdresi, whatsappAdresi } = await import("../src/lib/saat.ts");

  const gunler = gunleriCoz("Her gün");
  gunler.length === 7 ? ok('"Her gün" yedi güne çözümleniyor') : no(`${gunler.length} gün`);
  gunleriCoz("Pazartesi – Cumartesi").length === 6
    ? ok("aralık çözümleniyor") : no("aralık bozuk");

  const S = [{ gunler: "Her gün", acilis: "07:30", kapanis: "22:00" }];
  const denemeler = [
    ["07:00", "2026-08-17T04:00:00Z", false, "Bugün 07:30'da açılır"],
    ["12:00", "2026-08-17T09:00:00Z", true, "Kapanış 22:00"],
    ["22:30", "2026-08-17T19:30:00Z", false, "Yarın 07:30'da açılır"],
    ["00:30", "2026-08-17T21:30:00Z", false, "Bugün 07:30'da açılır"],
    ["21:59", "2026-08-17T18:59:00Z", true, "Kapanış 22:00"],
    ["22:00", "2026-08-17T19:00:00Z", false, "Yarın 07:30'da açılır"],
  ];
  for (const [et, utc, bAcik, bAyrinti] of denemeler) {
    const d = durumHesapla(S, new Date(utc));
    (d.acik === bAcik && d.ayrinti === bAyrinti)
      ? ok(`${et} → ${d.metin} · ${d.ayrinti}`)
      : no(`${et}: beklenen "${bAyrinti}", gelen "${d.ayrinti}"`);
  }

  // gece yarısı
  const G = [{ gunler: "Pazartesi – Pazar", acilis: "22:00", kapanis: "02:00" }];
  const gece = (utc) => durumHesapla(G, new Date(utc)).acik;
  (gece("2026-08-17T20:00:00Z") && gece("2026-08-17T22:30:00Z") && !gece("2026-08-18T00:30:00Z"))
    ? ok("gece yarısı geçişi doğru (22:00–02:00)") : no("gece yarısı yanlış");

  // saat eki
  const ekler = { "07:30": saatEki(7 * 60 + 30), "08:00": saatEki(8 * 60),
                  "13:45": saatEki(13 * 60 + 45), "10:40": saatEki(10 * 60 + 40) };
  (ekler["07:30"] === "da" && ekler["08:00"] === "de"
   && ekler["13:45"] === "te" && ekler["10:40"] === "ta")
    ? ok(`ek doğru: ${Object.entries(ekler).map(([a, b]) => `${a}'${b}`).join(", ")}`)
    : no(JSON.stringify(ekler));

  // saat dilimi
  const z = istanbulZamani(new Date("2026-08-17T09:00:00Z"));
  z.dakika === 720 ? ok("Europe/Istanbul sabit (UTC 09:00 → 12:00)") : no(`${z.dakika}`);

  // eksik/bozuk veri
  [undefined, [], [{ gunler: "Zamazingo", acilis: "08:00", kapanis: "21:00" }],
   [{ gunler: "Pazar", acilis: "abc", kapanis: "21:00" }]]
    .every((x) => durumHesapla(x) === null)
    ? ok("saat verisi eksik/bozukken null") : no("null dönmedi");

  // bağlantılar
  telAdresi("0362 854 11 44") === "tel:03628541144"
    ? ok("tel: boşluksuz") : no(telAdresi("0362 854 11 44"));
  whatsappAdresi("0555 123 45 67", "Merhaba") === "https://wa.me/905551234567?text=Merhaba"
    ? ok("wa.me 0 → 90 düzeltmesi") : no("wa.me yanlış");
  whatsappAdresi("123", "x") === null ? ok("geçersiz numara reddediliyor") : no("kabul edildi");
}

/* ═══════ 2. Sunucu render — geçişin amacı ═══════ */
bolum("2 — Ham HTML (JS çalıştırmadan)");
{
  const ham = await (await fetch(B + "/")).text();
  const kart = (ham.match(/<article class="kart/g) || []).length;
  const yol = new Set(ham.match(/\/urun\/u\d+/g) || []);
  kart === 470 ? ok(`ham HTML'de ${kart} ürün kartı`) : no(`${kart} kart`);
  yol.size === 470 ? ok(`${yol.size} benzersiz ürün adresi`) : no(`${yol.size} adres`);

  const urun = await (await fetch(B + "/urun/u001")).text();
  const baslik = /<title>([^<]*)<\/title>/.exec(urun)?.[1] ?? "";
  const aciklama = /<meta name="description" content="([^"]*)"/.exec(urun)?.[1] ?? "";
  /Akçasaray/.test(baslik) && /₺/.test(baslik)
    ? ok(`ürün başlığı: ${baslik.slice(0, 58)}…`) : no(`başlık: ${baslik}`);
  /reyonu/.test(aciklama) ? ok("ürün açıklaması üretiliyor") : no(`açıklama: ${aciklama}`);
  /rel="canonical" href="[^"]*\/urun\/u001"/.test(urun)
    ? ok("canonical doğru") : no("canonical yok");
}

/* ═══════ 3. Tarayıcı: dükkân bölümü, ölçüler, kontrast ═══════ */
/* Kontrast — SAYFANIN TAMAMI taranıyor.

   Eskiden burada tek bir örnek vardı: `.kart h3`'ün rengi, arka planı da
   "rgb(255,255,255)" diye SABİT varsayılarak ölçülüyordu. İki ayrı şekil
   hatası: (1) tek bir metin/zemin çifti bütün sayfanın yerine geçiyordu,
   (2) gerçek zemin okunmuyordu. Koyu zemindeki soluk metin, sarı rozet
   üstündeki yazı, altbilginin beyaz/60 metni — hiçbiri denetlenmiyordu ve
   sınama yine de yeşil yanıyordu. Dokunma hedeflerindeki hatanın aynısı.

   Şimdi: görünür metin taşıyan her öğe geziliyor, zemin ata zincirinde
   saydam olmayan ilk renge kadar çıkılarak BULUNUYOR, WCAG AA eşiği metin
   boyuna göre uygulanıyor (büyük metin 3.0, normal 4.5).

   Ölçülemeyen durumlar sessizce geçilmiyor, ayrıca sayılıyor: zemini
   görsel ya da gradyan olan metnin kontrastı bu yöntemle hesaplanamaz. */
const KONTRAST = `(() => {
  /* Renkleri CANVAS ile gerçek piksele çeviriyoruz, metinden ayrıştırarak
     değil. Sebebi somut: Tailwind 4 saydamlıklı renkleri
     "oklab(0.999994 0.0000455677 0.0000200868 / 0.8)" gibi üretiyor.
     Sayıları regex'le çekip RGB sanan bir ayrıştırıcı bunu siyaha yakın
     okuyor ve beyaz metni koyu zeminde 1.2:1 diye RAPORLUYOR — sahte
     kırmızı. Canvas hem oklab/color-mix gibi her renk fonksiyonunu
     çözüyor hem de alfayı zeminin üstüne DOĞRU şekilde bindiriyor. */
  const tuval = document.createElement('canvas');
  tuval.width = tuval.height = 1;
  const ctx = tuval.getContext('2d', { willReadFrequently: true });

  /* ust rengini alt renginin üzerine bindirip sonucu RGB olarak verir. */
  const pikselle = (ust, alt) => {
    ctx.clearRect(0, 0, 1, 1);
    if (alt) { ctx.fillStyle = alt; ctx.fillRect(0, 0, 1, 1); }
    ctx.fillStyle = ust;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return [r, g, b];
  };

  const lum = (renk) => { const [a,b,c] = Array.isArray(renk) ? renk : pikselle(renk, 'rgb(255,255,255)');
    const f = (v) => { v/=255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); };
    return 0.2126*f(a) + 0.7152*f(b) + 0.0722*f(c); };
  const oran = (on, arka) => { const a = lum(on), b = lum(arka);
    return Math.round(((Math.max(a,b)+0.05)/(Math.min(a,b)+0.05))*100)/100; };
  window.__k = oran;

  /* Saydamlık ölçümü de canvas ile: renk beyaz ve siyah zemine ayrı ayrı
     bindirildiğinde sonuç değişiyorsa altındaki zemin sızıyor demektir. */
  const saydam = (renk) => {
    if (!renk || renk === 'transparent') return true;
    const beyazda = pikselle(renk, 'rgb(255,255,255)');
    const siyahta = pikselle(renk, 'rgb(0,0,0)');
    return beyazda.some((v, i) => Math.abs(v - siyahta[i]) > 1);
  };

  /* Metnin gerçekten oturduğu zemin: ata zincirinde saydam olmayan ilk
     arka plan. Yolda görsel/gradyan varsa ölçülemez diyoruz. */
  const zemin = (e) => {
    for (let n = e; n && n !== document.documentElement.parentNode; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.backgroundImage && s.backgroundImage !== 'none') return { olcusuz: true };
      if (!saydam(s.backgroundColor)) return { renk: s.backgroundColor };
    }
    return { renk: 'rgb(255, 255, 255)' };
  };

  window.__kontrastTara = () => {
    const kotu = [];
    let olculen = 0, olcusuz = 0;
    for (const e of document.querySelectorAll('body *')) {
      // yalnızca DOĞRUDAN metin taşıyan öğeler; kaplar iki kez sayılmasın
      const metin = [...e.childNodes]
        .filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join('');
      if (!metin) continue;
      const b = e.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) continue;
      const s = getComputedStyle(e);
      if (s.visibility === 'hidden' || s.display === 'none' || s.opacity === '0') continue;

      const z = zemin(e);
      if (z.olcusuz) { olcusuz++; continue; }
      olculen++;

      const px = parseFloat(s.fontSize);
      const kalin = parseInt(s.fontWeight, 10) >= 700;
      const buyuk = px >= 24 || (kalin && px >= 18.66);
      const esik = buyuk ? 3 : 4.5;
      // metin rengi zeminin ÜSTÜNE bindirilerek çözülüyor (alfa dahil)
      const o = oran(pikselle(s.color, z.renk), pikselle(z.renk, 'rgb(255,255,255)'));
      if (o < esik) {
        kotu.push(metin.slice(0, 22) + ' → ' + o + ':1 (eşik ' + esik + ', ' + Math.round(px) + 'px)');
      }
    }
    return { kotu, olculen, olcusuz };
  };
})()`;

const t = await chromium.launch({ executablePath: CHROME, headless: true });
try {
  for (const en of [320, 375, 1280]) {
    bolum(`3 — ${en}px`);
    const c = await t.newContext({ viewport: { width: en, height: 1000 } });
    const s = await c.newPage();
    const hata = [];
    s.on("pageerror", (e) => hata.push(e.message));
    await s.goto(B + "/", { waitUntil: "networkidle", timeout: 90000 });
    await s.waitForTimeout(1200);
    await s.evaluate(KONTRAST);

    const r = await s.evaluate(() => {
      const de = document.documentElement;
      const bol = document.getElementById("dukkan");
      const tel = bol?.querySelector('a[href^="tel:"]');
      const harita = bol?.querySelector('a[href*="maps"]');
      /* Dokunma hedefleri — SAYFANIN TAMAMI taranıyor.
         Eskiden burada elle seçilmiş bir liste vardı ('#dukkan a, .dugme,
         select, #dukkan-serit a'). O liste reyon çiplerini kapsamıyordu ve
         çipler 40px'ken sınama yeşil yanıyordu: kural ihlal ediliyor ama
         nöbetçi başka yere bakıyordu. Artık etkileşimli her öğeye bakılıyor;
         muafiyetler AÇIKÇA yazılı ve gerekçeli. */
      const kucuk = [];
      const MUAF = (e) => (
        // Ürün kartının tamamı zaten dev bir hedef; içindeki metin
        // bağlantısı onun üstünde, ayrı bir hedef değil.
        e.closest('.kart') ||
        // Gizli/ölçüsüz öğeler (kapalı menü içerikleri vb.)
        e.getBoundingClientRect().width === 0
      );
      document.querySelectorAll(
        'a[href], button, input, select, textarea, summary, [role="button"], [tabindex]:not([tabindex="-1"])'
      ).forEach((e) => {
        if (MUAF(e)) return;
        const b = e.getBoundingClientRect();
        if (b.width > 0 && b.height > 0 && (b.height < 44 || b.width < 44)) {
          kucuk.push(`${(e.textContent || e.tagName).trim().slice(0, 16)} ${Math.round(b.width)}x${Math.round(b.height)}`);
        }
      });
      return {
        tasma: de.scrollWidth > de.clientWidth, w: de.scrollWidth, cw: de.clientWidth,
        kart: document.querySelectorAll(".kart").length,
        kutu: [...(bol?.querySelectorAll(".rounded-buyuk h3") ?? [])].map((x) => x.textContent),
        telHref: tel?.getAttribute("href") ?? null,
        haritaRel: harita?.getAttribute("rel") ?? null,
        wa: document.querySelectorAll('a[href*="wa.me"]').length,
        durum: document.querySelector("#dukkan-serit strong")?.textContent ?? null,
        kucuk,
        kontrast: window.__kontrastTara(),
      };
    });

    !r.tasma ? ok(`yatay taşma yok (${r.w}/${r.cw})`) : no(`TAŞMA ${r.w}/${r.cw}`);
    r.kart === 470 ? ok("470 kart") : no(`${r.kart} kart`);
    r.telHref === "tel:03628541144" ? ok("tel: doğru") : no(`${r.telHref}`);
    r.haritaRel === "noopener noreferrer" ? ok("harita rel doğru") : no(`${r.haritaRel}`);
    r.wa === 0 ? ok("WhatsApp boş, düğme yok") : no(`${r.wa} WhatsApp`);
    r.durum ? ok(`durum göstergesi: ${r.durum}`) : no("durum yok");
    r.kucuk.length === 0 ? ok("dokunma hedefleri ≥44px") : no(`küçük: ${r.kucuk.join(" | ")}`);
    r.kontrast.kotu.length === 0
      ? ok(`kontrast AA: ${r.kontrast.olculen} metin öğesi ölçüldü, hepsi geçti` +
           (r.kontrast.olcusuz ? ` (${r.kontrast.olcusuz} tanesi görsel/gradyan zeminde, ölçülemedi)` : ""))
      : no(`AA altı ${r.kontrast.kotu.length}: ${r.kontrast.kotu.slice(0, 6).join(" | ")}`);
    hata.length === 0 ? ok("JS hatası yok") : no(`${hata.length}: ${hata.join(" | ")}`);
    await c.close();
  }
} finally {
  writeFileSync(VERI, OZGUN);
  await t.close();
}

console.log(`\n${"═".repeat(62)}\nSONUÇ: ${g} geçti, ${k} kaldı`);
process.exit(k === 0 ? 0 : 1);
