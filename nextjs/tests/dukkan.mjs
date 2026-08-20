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
const KONTRAST = `(() => {
  const lum = (r) => { const [a,b,c] = r.match(/\\d+(\\.\\d+)?/g).slice(0,3).map(Number);
    const f = (v) => { v/=255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); };
    return 0.2126*f(a) + 0.7152*f(b) + 0.0722*f(c); };
  window.__k = (on, arka) => { const a = lum(on), b = lum(arka);
    return Math.round(((Math.max(a,b)+0.05)/(Math.min(a,b)+0.05))*100)/100; };
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
        adKontrast: (() => { const e = document.querySelector(".kart h3");
          return e ? window.__k(getComputedStyle(e).color, "rgb(255,255,255)") : null; })(),
      };
    });

    !r.tasma ? ok(`yatay taşma yok (${r.w}/${r.cw})`) : no(`TAŞMA ${r.w}/${r.cw}`);
    r.kart === 470 ? ok("470 kart") : no(`${r.kart} kart`);
    r.telHref === "tel:03628541144" ? ok("tel: doğru") : no(`${r.telHref}`);
    r.haritaRel === "noopener noreferrer" ? ok("harita rel doğru") : no(`${r.haritaRel}`);
    r.wa === 0 ? ok("WhatsApp boş, düğme yok") : no(`${r.wa} WhatsApp`);
    r.durum ? ok(`durum göstergesi: ${r.durum}`) : no("durum yok");
    r.kucuk.length === 0 ? ok("dokunma hedefleri ≥44px") : no(`küçük: ${r.kucuk.join(" | ")}`);
    (r.adKontrast ?? 0) >= 4.5 ? ok(`ürün adı kontrastı AA (${r.adKontrast}:1)`) : no(`${r.adKontrast}`);
    hata.length === 0 ? ok("JS hatası yok") : no(`${hata.length}: ${hata.join(" | ")}`);
    await c.close();
  }
} finally {
  writeFileSync(VERI, OZGUN);
  await t.close();
}

console.log(`\n${"═".repeat(62)}\nSONUÇ: ${g} geçti, ${k} kaldı`);
process.exit(k === 0 ? 0 : 1);
