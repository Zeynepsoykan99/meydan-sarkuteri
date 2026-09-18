/* =====================================================================
   Vitrin — arama / reyon sonrası kaydırma ve durum göstergesi
   tests/vitrin-kaydirma.mjs

   Çalıştırma:
     npm i --no-save playwright-core
     npm run build && npm start -- -p 3001
     node --experimental-strip-types tests/vitrin-kaydirma.mjs

   NEDEN VAR: üç kullanıcı şikâyeti (17 Eylül 2026).
   1) Arama yapınca sonuç görünmüyordu: katalog ilk ekranın 1480–2126px
      altında, süzgeç değişince hiçbir şey kaydırmıyordu.
   2) Arama metni duruyorken seçilen reyon "açılmıyor gibi" görünüyordu:
      süzme iki süzgeci birleştiriyor (doğru), ama şerit rozeti "Fırından
      22" derken liste 2 ürün gösteriyordu ve sayaç reyondan söz
      etmiyordu. "Filtreleri sıfırla" da aramayı temizlemiyordu.
   3) Reyon seçilince de aynı kaydırma sorunu; listenin derinindeyken
      seçilirse ziyaretçi kısalan listenin dışına, altbilgiye düşüyordu.

   Bu dosya API'yi değil EKRANI ölçüyor: katalog başlığının yapışkan
   başlığa göre yeri, görünür kart sayısı, rozet ve sayaç metni.
   Veritabanına YAZMIYOR.

   Beklenen sayılar ("çikolata" → 38, Fırından → 2) veriden ÇALIŞMA
   ZAMANINDA okunuyor: sayfadaki rozetlerden. Sabit yazılan tek şey
   sayfa boyutu, o da koddan (lib/sayfalama).
   ===================================================================== */

import { chromium } from "playwright-core";
import { SAYFA_BOYUTU } from "../src/lib/sayfalama.ts";

const B = process.env.ADRES || "http://localhost:3001";
const CHROME = process.env.CHROME_YOLU || "C:/Program Files/Google/Chrome/Application/chrome.exe";

let g = 0, k = 0;
const ok = (m) => { console.log(`  ✓ ${m}`); g++; };
const no = (m) => { console.log(`  ✗ ${m}`); k++; };
const bolum = (t) => console.log(`\n${"═".repeat(62)}\n${t}\n${"═".repeat(62)}`);
const bak = (kosul, iyi, kotu) => (kosul ? ok(iyi) : no(kotu));

/* BİLİNEN HATA gözlemi: sonuç sayılmıyor, yalnızca yazılıyor. Sürekli
   kırmızı duran bir sınama, bir süre sonra bakılmayan bir sınamadır;
   ama hatayı sınamadan da çıkarmak, düzeltildiğinde kimsenin fark
   etmemesi demek. Düzeltilince bak()'a çevrilecek. */
let bilinenSayi = 0;
const bilinen = (kosul, duzeldi, suruyor) => {
  if (kosul) { console.log(`  ⚑ ${duzeldi} — BİLİNEN HATA DÜZELMİŞ, bu sınama bak()'a çevrilmeli`); }
  else { console.log(`  ⚠ ${suruyor} (bilinen hata, ayrı iş)`); bilinenSayi++; }
};

const ARANAN = "çikolata";
const GENISLIKLER = [[320, 640], [375, 740], [1280, 800]];

/* Konsol ve ağ hataları BÜTÜN bağlamlardan toplanıyor; hariç tutma
   listesi YOK — favicon.ico 404'ü dosya eklenerek kapatıldı. */
const hatalar = [];

let tarayici = null;

async function sayfaAc(en, boy, ek = {}) {
  const c = await tarayici.newContext({ viewport: { width: en, height: boy }, ...ek });
  /* scrollIntoView çağrılarının davranış argümanını kaydet — hareket
     azaltma tercihine uyulduğunu zamanlamaya bakmadan ölçmek için. */
  await c.addInitScript(() => {
    window.__kaydirmalar = [];
    const asil = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (o) {
      window.__kaydirmalar.push(typeof o === "object" ? o.behavior ?? "auto" : "auto");
      return asil.call(this, o);
    };
  });
  const s = await c.newPage();
  s.on("console", (m) => m.type() === "error" && hatalar.push(`${en}px console: ${m.text()}`));
  s.on("pageerror", (e) => hatalar.push(`${en}px pageerror: ${e}`));
  s.on("response", (r) => r.status() >= 400 && hatalar.push(`${en}px ${r.status()} ${r.url()}`));
  s.on("requestfailed", (r) => {
    // Sayfadan ayrılırken iptal edilen görsel/RSC istekleri hata değil.
    if (!/ERR_ABORTED/.test(r.failure()?.errorText ?? "")) hatalar.push(`${en}px ağ: ${r.url()}`);
  });
  await s.goto(B + "/", { waitUntil: "load", timeout: 120000 });
  // Hidrasyon: "Daha fazla göster" bağlantısı hidrasyondan sonra gizleniyor.
  await s.waitForFunction(() => !document.querySelector('#katalog a[href^="/?sayfa="]'), null, { timeout: 30000 });
  return { c, s };
}

/** Kaydırma durana kadar bekle (yumuşak kaydırma dahil). */
async function dur(s) {
  let once = -1, ayni = 0;
  for (let i = 0; i < 40 && ayni < 3; i++) {
    await s.waitForTimeout(100);
    const y = await s.evaluate(() => scrollY);
    ayni = y === once ? ayni + 1 : 0;
    once = y;
  }
}

async function olc(s) {
  return s.evaluate(() => {
    /* Seçiciler DÜZELTME ÖNCESİ işaretlemeye de düşüyor: sınama eski
       kodda da çalışabilmeli, yoksa "hatayı gerçekten yakalıyor mu"
       sorusu yanıtlanamaz — çöken bir sınama hiçbir şey kanıtlamaz. */
    const yapiskan = (document.querySelector(".yapiskan-baslik") ?? document.querySelector("div.sticky"))
      .getBoundingClientRect().bottom;
    const kat = document.querySelector("#katalog");
    const kartlar = [...kat.querySelectorAll("article.kart")];
    const bosBaslik = [...kat.querySelectorAll("p")].find((e) => e.textContent.includes("Tezgâhta bulamadık"));
    const bos = kat.querySelector("[data-bos-aciklama]") ?? bosBaslik?.nextElementSibling ?? null;
    return {
      scrollY: Math.round(scrollY),
      yapiskan: Math.round(yapiskan),
      katalogTop: Math.round(kat.getBoundingClientRect().top),
      kart: kartlar.length,
      ekrandaKart: kartlar.filter((e) => {
        const r = e.getBoundingClientRect();
        return r.bottom > yapiskan && r.top < innerHeight;
      }).length,
      sayac: (kat.querySelector("[data-sayac]") ?? kat.querySelector("h2").nextElementSibling).textContent,
      bos: bos ? bos.textContent : null,
      bosEkranda: bos ? bos.getBoundingClientRect().bottom <= innerHeight : null,
      kaydirmalar: [...window.__kaydirmalar],
    };
  });
}

/* Katalog başlığı yapışkan başlığın hemen altında mı: üstünde kalırsa
   başlık örtülür, çok altında kalırsa "sonuç görünmüyor" geri gelir. */
const hizali = (d) => d.katalogTop >= d.yapiskan - 1 && d.katalogTop <= d.yapiskan + 6;
const yer = (d) => `katalog başlığı ${d.katalogTop}px, yapışkan alt ${d.yapiskan}px, ekranda ${d.ekrandaKart} kart`;

async function rozetler(s) {
  return s.evaluate(() => Object.fromEntries(
    [...document.querySelectorAll("nav[aria-label=Reyonlar] button")].map((b) => {
      const r = b.querySelector(".reyon-adet");
      // Anahtar reyon ADI: işaretleme değişse de sınama çalışsın diye
      const yalin = [...b.childNodes]
        .filter((n) => n.nodeType === 3 ||
          (n.nodeType === 1 && !n.matches(".reyon-adet, .sr-only, [aria-hidden]")))
        .map((n) => n.textContent).join("").replace(/\s+/g, " ").trim();
      return [yalin, {
        n: Number(r.textContent),
        arama: r.classList.contains("reyon-adet-arama"),
        sifir: r.hasAttribute("data-sifir"),
        ad: b.textContent.replace(/\s+/g, " ").trim(),
        yalin,
      }];
    })));
}

const TUM = "Tüm reyonlar";
/** Reyon çipi ADA göre — işaretlemeye değil ekrandaki yazıya bakıyor. */
const reyonDugme = (s, ad) =>
  s.locator("nav[aria-label=Reyonlar] button").filter({ hasText: ad }).first();

async function derineIn(s, px = 3000) {
  await s.evaluate((px) => scrollTo(0, document.querySelector("#katalog").offsetTop + px), px);
  await dur(s);
}

async function dibe(s) {
  await s.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await dur(s);
}

try {
  tarayici = await chromium.launch({ executablePath: CHROME });

  /* Veriden beklenen sayılar. Toplamlar arama yokken rozetlerden
     (sunucu sayıyor); kesişimler ise LİSTEDEN — her reyona basıp kart
     sayılıyor, süzgeç etkinken sayfalama kapalı olduğu için kart sayısı
     sonuç sayısı. Rozetten okusaydık rozet eki bozulduğunda beklenen
     değer de onunla birlikte bozulurdu. */
  let TOPLAM;
  const ARAMA = {};
  {
    const { c, s } = await sayfaAc(1280, 800);
    TOPLAM = await rozetler(s);
    await s.locator("#arama").fill(ARANAN);
    for (const id of Object.keys(TOPLAM)) {
      await reyonDugme(s, id).click();
      await s.waitForTimeout(80);
      ARAMA[id] = { n: await s.locator("#katalog article.kart").count() };
    }
    await c.close();
  }
  const SONUCLU = Object.keys(ARAMA).filter((id) => id !== TUM && ARAMA[id].n > 0);
  const SONUCSUZ = Object.keys(ARAMA).filter((id) => id !== TUM && ARAMA[id].n === 0);
  const DAR = SONUCLU.find((id) => ARAMA[id].n < TOPLAM[id].n);   // "22 yazıyor 2 geldi" türü
  console.log(`VERİ: "${ARANAN}" → ${ARAMA[TUM].n}; sonuçlu reyonlar ${SONUCLU.map((id) => `${id}=${ARAMA[id].n}/${TOPLAM[id].n}`).join(", ")}; sonuçsuz ${SONUCSUZ.length}`);
  if (!DAR || !SONUCSUZ.length) {
    console.error("veri sınamaya uygun değil: daralan ya da sonuçsuz reyon yok");
    process.exit(1);
  }

  /* ═══════ 1. İlk yükleme kaydırmıyor ═══════ */
  bolum("1 — İlk yükleme: kaydırma yok");
  for (const [en, boy] of GENISLIKLER) {
    const { c, s } = await sayfaAc(en, boy);
    await s.waitForTimeout(800);
    const d = await olc(s);
    bak(d.scrollY === 0 && d.kaydirmalar.length === 0,
      `${en}px: sayfa başta kaldı`, `${en}px: ilk yüklemede kaydı (scrollY ${d.scrollY}, ${d.kaydirmalar.length} çağrı)`);
    await c.close();
  }

  /* ═══════ 2. Arama ═══════ */
  bolum("2 — Arama: sonuçlar ekrana geliyor, yazarken titremiyor");
  for (const [en, boy] of GENISLIKLER) {
    const { c, s } = await sayfaAc(en, boy);
    const kutu = s.locator("#arama");

    await kutu.pressSequentially(ARANAN[0]);
    await dur(s);
    let d = await olc(s);
    bak(hizali(d) && d.ekrandaKart >= 1,
      `${en}px: ilk harfte katalog başa geldi (${yer(d)})`, `${en}px: ilk harften sonra ${yer(d)}`);

    /* Kalan harfler: başlık zaten yerinde, sayfa kıpırdamamalı. */
    await s.evaluate(() => { window.__olay = 0; addEventListener("scroll", () => window.__olay++); });
    const y0 = d.scrollY, cagri0 = d.kaydirmalar.length;
    await kutu.pressSequentially(ARANAN.slice(1), { delay: 70 });
    await dur(s);
    d = await olc(s);
    const olay = await s.evaluate(() => window.__olay);
    bak(d.scrollY === y0 && olay === 0 && d.kaydirmalar.length === cagri0,
      `${en}px: sonraki ${ARANAN.length - 1} tuşta sayfa kıpırdamadı`,
      `${en}px: yazarken kaydı (scrollY ${y0}→${d.scrollY}, ${olay} olay, ${d.kaydirmalar.length - cagri0} çağrı)`);
    bak(d.kart === ARAMA[TUM].n && d.sayac.includes(`${ARAMA[TUM].n} ürün`),
      `${en}px: ${ARAMA[TUM].n} sonuç, sayaç doğru`, `${en}px: ${d.kart} kart, sayaç "${d.sayac}"`);

    /* Sonuçların dibindeyken aramayı değiştirmek başa getiriyor. */
    await dibe(s);
    await kutu.press("End");
    await kutu.press("Backspace");
    await dur(s);
    d = await olc(s);
    bak(hizali(d) && d.ekrandaKart >= 1,
      `${en}px: dipteyken arama değişince başa döndü`, `${en}px: dipte arama değişti, ${yer(d)}`);

    /* Arama kutusundaki ✕ — temizleyince de başa. */
    await dibe(s);
    await s.getByRole("button", { name: "Aramayı temizle", exact: true }).click();
    await dur(s);
    d = await olc(s);
    bak(hizali(d) && d.kart === SAYFA_BOYUTU && d.ekrandaKart >= 1,
      `${en}px: temizleyince ${SAYFA_BOYUTU} kartlık listenin başında`,
      `${en}px: temizledikten sonra ${d.kart} kart, ${yer(d)}`);
    await c.close();
  }

  /* ═══════ 3. Reyon ═══════ */
  bolum("3 — Reyon: seçilen reyon ekrana geliyor");
  for (const [en, boy] of GENISLIKLER) {
    const { c, s } = await sayfaAc(en, boy);

    await reyonDugme(s, DAR).click();
    await dur(s);
    let d = await olc(s);
    bak(hizali(d) && d.ekrandaKart >= 1 && d.kart === TOPLAM[DAR].n,
      `${en}px: sayfa başındayken ${DAR} → ${d.kart} ürün ekranda`,
      `${en}px: ${DAR} seçildi, ${d.kart} kart (beklenen ${TOPLAM[DAR].n}), ${yer(d)}`);
    bak(await reyonDugme(s, DAR).evaluate((e) => e === document.activeElement),
      `${en}px: odak seçilen reyon düğmesinde kaldı`, `${en}px: odak düğmeden kaçtı`);

    /* Listenin derinindeyken: kısalan listenin dışına düşmemeli. */
    await reyonDugme(s, TUM).click();
    await dur(s);
    await derineIn(s);
    await reyonDugme(s, DAR).click();
    await dur(s);
    d = await olc(s);
    bak(hizali(d) && d.ekrandaKart >= 1,
      `${en}px: derindeyken ${DAR} → listenin başında`, `${en}px: derindeyken ${DAR}, ${yer(d)}`);

    /* Derindeyken "Tüm reyonlar": başa gel, otomatik yükleme tetiklenmesin. */
    await dibe(s);
    await reyonDugme(s, TUM).click();
    await dur(s);
    await s.waitForTimeout(1500);
    d = await olc(s);
    bak(hizali(d) && d.kart === SAYFA_BOYUTU,
      `${en}px: Tüm reyonlar → başta, ${SAYFA_BOYUTU} kart (kaydırma yüklemeyi tetiklemedi)`,
      `${en}px: Tüm reyonlar → ${d.kart} kart, ${yer(d)}`);
    await c.close();
  }

  /* ═══════ 4. Arama + reyon: durum açık, rozet kesişimi ═══════ */
  bolum("4 — Arama + reyon birlikte: durum görünür, rozet kesişimi");
  for (const [en, boy] of GENISLIKLER) {
    const { c, s } = await sayfaAc(en, boy);
    const kutu = s.locator("#arama");

    /* Rozet — arama öncesi: toplamlar, arama işareti yok. */
    let r = await rozetler(s);
    bak(Object.values(r).every((x) => !x.arama) && r[DAR].n === TOPLAM[DAR].n,
      `${en}px: arama yokken rozet toplam (${DAR} ${r[DAR].n})`, `${en}px: arama yokken rozet ${JSON.stringify(r[DAR])}`);

    /* Bu bağlamın sonuna kadar HER KAREDE: arama varken SEÇİLİ reyonun
       rozeti arama rozeti olmalı ve listedeki kart sayısına eşit olmalı;
       arama yokken hiçbir rozet arama rozeti olmamalı. Geçişte bir kare
       bile "22 yazıyor 2 geldi" göstermesin. (İndirim/fiyat süzgeci bu
       bölümde kullanılmıyor; rozet onları bilerek saymıyor.) */
    await s.evaluate(() => {
      window.__uyumsuz = [];
      const bak = () => {
        const tum = document.querySelector('nav[aria-label=Reyonlar] button[aria-pressed="true"] .reyon-adet');
        const aramaVar = document.querySelector("#arama").value.trim() !== "";
        const kart = document.querySelectorAll("#katalog article.kart").length;
        if (aramaVar && (!tum.classList.contains("reyon-adet-arama") || Number(tum.textContent) !== kart))
          window.__uyumsuz.push(`${tum.textContent}/${kart}`);
        if (!aramaVar && document.querySelector(".reyon-adet-arama")) window.__uyumsuz.push("arama yok ama arama rozeti");
        window.__kare = requestAnimationFrame(bak);
      };
      bak();
    });
    await kutu.pressSequentially(ARANAN, { delay: 60 });
    await s.waitForTimeout(200);
    r = await rozetler(s);
    bak(Object.values(r).every((x) => x.arama) && r[TUM].n === ARAMA[TUM].n && r[DAR].n === ARAMA[DAR].n,
      `${en}px: arama varken rozet kesişim (Tüm ${r[TUM].n}, ${DAR} ${r[DAR].n})`,
      `${en}px: arama varken rozet ${JSON.stringify({ [TUM]: r[TUM], [DAR]: r[DAR] })}`);
    const toplamKesisim = SONUCLU.reduce((t, id) => t + r[id].n, 0);
    bak(toplamKesisim === r[TUM].n,
      `${en}px: reyon rozetlerinin toplamı "Tüm reyonlar" rozetine eşit (${toplamKesisim})`,
      `${en}px: reyon toplamı ${toplamKesisim}, Tüm rozeti ${r[TUM].n}`);
    bak(SONUCSUZ.every((id) => r[id].sifir) && SONUCLU.every((id) => !r[id].sifir),
      `${en}px: sıfır sonuçlu ${SONUCSUZ.length} reyon ayrı görünüşte`, `${en}px: sıfır işareti yanlış`);
    bak(/\d sonuç$/.test(r[DAR].ad) && /\d ürün$/.test(TOPLAM[DAR].ad),
      `${en}px: ekran okuyucu eki "ürün" → "sonuç" değişti`, `${en}px: düğme adı "${r[DAR].ad}"`);

    /* Daralan reyon: rozet = liste = sayaç. */
    await reyonDugme(s, DAR).click();
    await dur(s);
    let d = await olc(s);
    r = await rozetler(s);
    const reyonAdi = r[DAR].yalin;
    bak(d.kart === ARAMA[DAR].n && r[DAR].n === d.kart,
      `${en}px: ${DAR} rozeti ${r[DAR].n} = listede ${d.kart} kart`, `${en}px: rozet ${r[DAR].n}, liste ${d.kart}`);
    bak(d.sayac === `${reyonAdi} reyonunda "${ARANAN}" için ${d.kart} ürün bulundu.`,
      `${en}px: sayaç iki süzgeci de söylüyor: "${d.sayac}"`, `${en}px: sayaç "${d.sayac}" (reyon adı ${reyonAdi})`);
    bak(hizali(d) && d.ekrandaKart >= 1,
      `${en}px: arama varken reyon seçimi de başa getirdi`, `${en}px: ${yer(d)}`);
    /* Düğme YOKSA da çökmeden kırmızı verilmeli: sınama düzeltme öncesi
       kodda da koşuyor, orada bu düğmelerin hiçbiri yok. */
    const tumDugme = s.locator('#katalog button[data-eylem="tum-reyonlarda-ara"]').first();
    const tumVar = (await tumDugme.count()) > 0;
    bak(tumVar && (await tumDugme.textContent()).includes(`(${ARAMA[TUM].n})`),
      `${en}px: "Bütün reyonlarda ara (${ARAMA[TUM].n})" görünüyor`,
      tumVar ? `${en}px: düğme metni ${await tumDugme.textContent()}` : `${en}px: "Bütün reyonlarda ara" düğmesi YOK`);

    if (tumVar) {
      await tumDugme.click();
      await dur(s);
      d = await olc(s);
      bak(d.kart === ARAMA[TUM].n && (await reyonDugme(s, TUM).getAttribute("aria-pressed")) === "true"
          && (await kutu.inputValue()) === ARANAN,
        `${en}px: "Bütün reyonlarda ara" → ${d.kart} ürün, arama korundu`, `${en}px: ${d.kart} kart`);
    } else {
      no(`${en}px: "Bütün reyonlarda ara" düğmesi olmadığı için çıkış yolu sınanamadı`);
      await reyonDugme(s, TUM).click();
      await dur(s);
    }

    /* Sonuçsuz reyon: boş durum ekranda, çıkış yolu var. */
    const bosId = SONUCSUZ[0];
    await reyonDugme(s, bosId).click();
    await dur(s);
    d = await olc(s);
    bak(d.bos !== null && d.bos.includes(`bütün reyonlarda ${ARAMA[TUM].n} ürün var`),
      `${en}px: boş durum sebebini söylüyor`, `${en}px: boş durum metni "${d.bos}"`);
    const bosTum = s.locator('#katalog button[data-eylem="tum-reyonlarda-ara"]');
    bak((await bosTum.count()) === 2 && await bosTum.last().isVisible(),
      `${en}px: boş durumda "Bütün reyonlarda ara" düğmesi var`, `${en}px: boş durumda ${await bosTum.count()} düğme`);

    /* SIFIR SONUÇTA ÇIKIŞ YOLU EKRANDA MI. 320×640'ta boş kutunun
       kendisi katlanmanın altında kalıyor (sayaç + süzgeç satırı 337px
       yer kaplıyor, ölçüldü); ölçüt bu yüzden kutu değil ÇIKIŞ: sayaç
       "0 ürün bulundu" diyor ve hemen altındaki "Bütün reyonlarda ara"
       düğmesi görünür durumda. */
    const cikis = await s.evaluate(() => {
      const dug = document.querySelector('#katalog button[data-eylem="tum-reyonlarda-ara"]');
      const ust = (document.querySelector(".yapiskan-baslik") ?? document.querySelector("div.sticky"))
        .getBoundingClientRect().bottom;
      const sayEl = document.querySelector("[data-sayac]") ?? document.querySelector("#katalog h2").nextElementSibling;
      const gorunur = (e) => {
        const b = e.getBoundingClientRect();
        return b.top >= ust - 1 && b.bottom <= innerHeight;
      };
      return { dugme: dug ? gorunur(dug) : "düğme yok", sayac: gorunur(sayEl) };
    });
    bak(cikis.dugme && cikis.sayac && d.sayac.includes("0 ürün"),
      `${en}px: sıfır sonuçta sayaç ve çıkış düğmesi ekranda`,
      `${en}px: sıfır sonuçta çıkış ekranda değil ${JSON.stringify(cikis)}`);

    /* "Filtreleri sıfırla" aramayı da temizliyor — eski hata.
       Düğme ADA göre bulunuyor: düzeltme öncesi kodda da var. */
    await s.getByRole("button", { name: "Filtreleri sıfırla" }).click();
    await dur(s);
    d = await olc(s);
    r = await rozetler(s);
    bak((await kutu.inputValue()) === "" && d.kart === SAYFA_BOYUTU && d.sayac.includes(`${TOPLAM[TUM].n} ürün`),
      `${en}px: "Filtreleri sıfırla" aramayı da temizledi (${TOPLAM[TUM].n} ürün)`,
      `${en}px: sıfırla sonrası kutu "${await kutu.inputValue()}", ${d.kart} kart, "${d.sayac}"`);
    bak(Object.values(r).every((x) => !x.arama) && r[DAR].n === TOPLAM[DAR].n,
      `${en}px: rozetler toplama döndü`, `${en}px: rozet ${JSON.stringify(r[DAR])}`);
    bak(hizali(d), `${en}px: sıfırlayınca katalog başında`, `${en}px: ${yer(d)}`);

    /* "aramasını kaldır": arama gider, reyon kalır. */
    await reyonDugme(s, DAR).click();
    await kutu.fill(ARANAN);
    await dibe(s);
    const kaldir = s.locator('#katalog button[data-eylem="aramayi-kaldir"]');
    if ((await kaldir.count()) > 0) {
      await kaldir.click();
      await dur(s);
      d = await olc(s);
      bak((await kutu.inputValue()) === "" && d.kart === TOPLAM[DAR].n && hizali(d),
        `${en}px: "aramasını kaldır" → ${DAR} reyonunun ${d.kart} ürünü, başta`,
        `${en}px: kaldır sonrası ${d.kart} kart, ${yer(d)}`);
    } else {
      no(`${en}px: sayaç altındaki "aramasını kaldır" düğmesi YOK`);
    }

    const uyumsuz = await s.evaluate(() => { cancelAnimationFrame(window.__kare); return window.__uyumsuz; });
    bak(uyumsuz.length === 0,
      `${en}px: hiçbir karede rozet ile liste çelişmedi`, `${en}px: ${uyumsuz.length} çelişkili kare: ${uyumsuz.slice(0, 5)}`);
    await c.close();
  }

  /* ═══════ 5. Ürün sayfası ═══════ */
  bolum("5 — Ürün sayfasında rozet ve reyon seçimi");
  {
    const { c, s } = await sayfaAc(375, 740);
    await s.locator("#arama").fill(ARANAN);
    await s.locator("#katalog article.kart a").first().click();
    await s.waitForURL(/\/urun\//);
    await s.waitForTimeout(500);
    const r = await rozetler(s);
    bak(Object.values(r).every((x) => !x.arama) && r[DAR].n === TOPLAM[DAR].n,
      "ürün sayfasında rozet toplamı gösteriyor (listelenen bir arama yok)",
      `ürün sayfasında rozet ${JSON.stringify(r[DAR])}`);
    await reyonDugme(s, DAR).click();
    await s.waitForURL((u) => u.pathname === "/");
    await s.waitForSelector("#katalog article.kart");
    await dur(s);
    const d = await olc(s);
    bak(hizali(d) && d.kart === ARAMA[DAR].n,
      `ürün sayfasından ${DAR} → katalogda ${d.kart} sonuç, başlık yerinde`,
      `ürün sayfasından dönüş: ${d.kart} kart, ${yer(d)}`);
    await c.close();
  }

  /* ═══════ 6. Hareket azaltma ═══════ */
  bolum("6 — prefers-reduced-motion");
  for (const [tercih, bekle] of [["reduce", "auto"], ["no-preference", "smooth"]]) {
    const { c, s } = await sayfaAc(375, 740, { reducedMotion: tercih });
    await s.locator("#arama").pressSequentially("ç");
    /* Anında kaydırmada sonuç bir sonraki karede yerinde olmalı. */
    await s.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const hemen = await olc(s);
    bak(hemen.kaydirmalar.length === 1 && hemen.kaydirmalar[0] === bekle,
      `${tercih}: kaydırma davranışı "${bekle}"`, `${tercih}: çağrılar ${JSON.stringify(hemen.kaydirmalar)}`);
    if (tercih === "reduce") {
      bak(hizali(hemen), "reduce: iki karede yerinde (animasyon yok)", `reduce: iki kare sonra ${yer(hemen)}`);
    }
    await c.close();
  }

  /* ═══════ 7. Süzgeç kalkınca otomatik yükleme ═══════

     BİLİNEN HATA (17 Eylül 2026, ayrı iş olarak duruyor). Süzgeç
     kalkarken KatalogBolumu'nda iki effect aynı karede çakışıyor:
     otomatik yükleme effect'i (bugünkü satır ~155) o an hâlâ ESKİ
     kaydırma konumundan bakıyor, nöbetçiyi menzilde görüp kendi "bitti"
     bayrağını açıyor ve bir dilim istiyor; hemen ardından sıfırlama
     effect'i (satır ~200) adedi 30'a geri çekiyor. Net durum
     değişmediği için effect'in bağımlılıkları da değişmiyor, yani
     dinleyici bir daha KURULMUYOR: bayrağı açık, ölü bir dinleyici
     kalıyor. Ziyaretçi dibe insin, nöbetçi ekranda olsun, scroll ve
     resize olayları elle gönderilsin — hiçbir şey yüklenmiyor. Süzgeç
     bir kez daha değişirse (reyon seç-bırak) effect yeniden kuruluyor
     ve yükleme açılıyor (ölçüldü: 120 karta çıkıyor).

     Kaydırma düzeltmesi bunu KALDIRMIYOR: kaydırma effect'i sonra
     çalıştığı ve yumuşak olduğu için, çakışma anında konum hâlâ eski.
     Sonucu: süzgeç kaldırıldıktan sonra ziyaretçi 30 üründen fazlasını
     ancak sayfayı yenileyerek ya da süzgeci bir kez daha değiştirerek
     görebiliyor. */
  bolum("7 — Süzgeç kalkınca otomatik yükleme (bilinen hata)");
  for (const [en, boy] of [[375, 740], [1280, 800]]) {
    const { c, s } = await sayfaAc(en, boy);

    /* Önce KONTROL: hiç süzgeç kullanılmadan aşağı inince yükleniyor mu?
       Yöntemin kendisi doğru çalışsın diye — 12 tekerlek hareketi
       nöbetçiye ulaşmıyordu, ölçüm bu yüzden yanıltıyordu. */
    const inVeSay = async () => {
      let n = await s.locator("#katalog article.kart").count();
      for (let i = 0; i < 60; i++) {
        await s.evaluate(() => scrollBy(0, 700));
        await s.waitForTimeout(110);
        n = Math.max(n, await s.locator("#katalog article.kart").count());
      }
      return n;
    };
    bak((await inVeSay()) > SAYFA_BOYUTU,
      `${en}px: kontrol — süzgeçsiz inişte otomatik yükleme çalışıyor`,
      `${en}px: kontrol BAŞARISIZ — süzgeçsiz inişte de yüklenmiyor, ölçüm yöntemi şüpheli`);

    await s.goto(B + "/", { waitUntil: "load" });
    await s.locator("#arama").fill(ARANAN);
    await dur(s);
    await dibe(s);
    await s.getByRole("button", { name: "Aramayı temizle", exact: true }).click();
    await dur(s);
    const d = await olc(s);
    bak(d.kart === SAYFA_BOYUTU && hizali(d),
      `${en}px: temizlendi, ${SAYFA_BOYUTU} kart, başta`, `${en}px: ${d.kart} kart, ${yer(d)}`);
    bilinen((await inVeSay()) > SAYFA_BOYUTU,
      `${en}px: temizlik sonrası otomatik yükleme çalıştı`,
      `${en}px: temizlik sonrası otomatik yükleme takılı — dibe inildi, ${SAYFA_BOYUTU} kartta kaldı`);
    await c.close();
  }

  /* ═══════ 8. Ölçüler ═══════ */
  bolum("8 — Ölçüler (320/375/1280): taşma yok, dokunma hedefleri");
  for (const [en, boy] of GENISLIKLER) {
    const { c, s } = await sayfaAc(en, boy);
    await reyonDugme(s, SONUCSUZ[0]).click();
    await s.locator("#arama").fill("çikolatalıfındıklıgofretbüyükboyekonomikpaket");
    await dur(s);
    const r = await s.evaluate(() => {
      const de = document.documentElement;
      const kucuk = [...document.querySelectorAll("#katalog button")]
        .map((e) => e.getBoundingClientRect())
        .filter((b) => b.width > 0 && (b.height < 44 || b.width < 44)).length;
      const tasan = [...document.querySelectorAll("#katalog *")]
        .filter((e) => e.getBoundingClientRect().right > de.clientWidth + 1).length;
      return { yatay: de.scrollWidth - de.clientWidth, kucuk, tasan };
    });
    bak(r.yatay <= 0 && r.tasan === 0,
      `${en}px: uzun aramayla bile yatay taşma yok`, `${en}px: taşma ${r.yatay}px, ${r.tasan} öğe`);
    bak(r.kucuk === 0, `${en}px: katalog düğmeleri ≥44px`, `${en}px: ${r.kucuk} küçük düğme`);

    /* Arama rozetinin kontrastı, seçili ve seçili olmayan çipte. */
    await s.locator("#arama").fill(ARANAN);
    await reyonDugme(s, DAR).click();
    await s.waitForTimeout(200);
    const kontrast = await s.evaluate(() => {
      const rgb = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number);
      const lum = ([r, g, b]) => {
        const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const zemin = (e) => {
        for (let x = e; x; x = x.parentElement) {
          const c = getComputedStyle(x).backgroundColor;
          if (!/rgba\(.*,\s*0\)$/.test(c) && c !== "transparent") return c;
        }
        return "rgb(255,255,255)";
      };
      const oran = (e) => {
        const a = lum(rgb(getComputedStyle(e).color)), b = lum(rgb(zemin(e)));
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      };
      return [...document.querySelectorAll(".reyon-adet-arama")].map(oran);
    });
    const enAz = Math.min(...kontrast);
    bak(enAz >= 4.5, `${en}px: arama rozetlerinde en düşük kontrast ${enAz.toFixed(2)}:1`,
      `${en}px: arama rozeti kontrastı ${enAz.toFixed(2)}:1 (AA altı)`);
    await c.close();
  }

  /* ═══════ 9. Yapışkan başlık payı ═══════
     html { scroll-padding-top } başlığın kendi içindeki öğeleri de
     örtülmüş sayıyordu: aşağıdayken aramaya her harf sayfayı 115px, Tab
     ile her reyon çipi 361px yukarı itiyordu. Bu bölümde katalog
     kaydırması (scrollIntoView) SUSTURULUYOR — ölçülen şey yalnızca
     tarayıcının kendi odak/imleç kaydırması. */
  bolum("9 — Yapışkan başlık payı: odak ve imleç sayfayı itmiyor");
  for (const [en, boy] of GENISLIKLER) {
    const { c, s } = await sayfaAc(en, boy);
    await s.evaluate(() => { Element.prototype.scrollIntoView = function () {}; });
    await reyonDugme(s, TUM).click();          // sayfalama açık kalsın: liste uzun
    const Y = 2500;

    await s.evaluate((y) => scrollTo(0, y), Y);
    await s.locator("#arama").focus();
    await s.evaluate((y) => scrollTo(0, y), Y);
    const yazarken = [];
    /* BOŞLUK yazılıyor, harf değil: harf listeyi süzer, liste kısalınca
       tarayıcının kaydırma çapası konumu kendiliğinden düzeltir ve
       ölçüm kirlenir. Boşlukta sonuç kümesi ve sayfa yüksekliği aynı
       kalıyor, geriye yalnızca ölçmek istediğimiz şey kalıyor: imleci
       göstermek için yapılan kaydırma. */
    for (let i = 0; i < 3; i++) {
      const once = await s.evaluate(() => scrollY);
      await s.keyboard.type(" ");
      await s.waitForTimeout(80);
      const sonra = await s.evaluate(() => scrollY);
      if (sonra !== once) yazarken.push(`${Math.round(once)}→${Math.round(sonra)}`);
    }
    bak(yazarken.length === 0, `${en}px: aşağıdayken aramaya yazmak sayfayı itmiyor`,
      `${en}px: yazarken sayfa itildi: ${yazarken.join(", ")}`);

    await s.locator("#arama").fill("");
    await s.evaluate((y) => scrollTo(0, y), Y);
    await reyonDugme(s, TUM).focus();
    await s.evaluate((y) => scrollTo(0, y), Y);
    const tab = [];
    for (let i = 0; i < 3; i++) {
      await s.keyboard.press("Tab");
      await s.waitForTimeout(60);
      tab.push(Math.round(await s.evaluate(() => scrollY)));
    }
    bak(tab.every((y) => y === Y), `${en}px: Tab ile reyon çiplerinde gezmek sayfayı itmiyor`,
      `${en}px: Tab ile scrollY ${Y} → ${tab.join(", ")}`);

    /* Geri Tab: önceki öğe başlığın altında yarı gizliyken odaklanınca
       başlığın ALTINA inmeli (odak örtülmemeli). */
    const linkler = s.locator("#katalog article.kart a");
    await linkler.nth(12).focus();
    await s.evaluate(() => {
      const hepsi = [...document.querySelectorAll("a[href],button,input,select,[tabindex]")].filter((e) => e.tabIndex >= 0);
      const onceki = hepsi[hepsi.indexOf(document.activeElement) - 1];
      scrollTo(0, onceki.getBoundingClientRect().top + scrollY - 40);
    });
    await s.keyboard.press("Shift+Tab");
    await s.waitForTimeout(100);
    const odak = await s.evaluate(() => ({
      top: document.activeElement.getBoundingClientRect().top,
      alt: (document.querySelector(".yapiskan-baslik") ?? document.querySelector("div.sticky"))
        .getBoundingClientRect().bottom,
    }));
    bak(odak.top >= odak.alt - 1, `${en}px: geri Tab'da odak başlığın altında (${Math.round(odak.top)} ≥ ${Math.round(odak.alt)})`,
      `${en}px: odak başlığın altında kaldı (${Math.round(odak.top)} < ${Math.round(odak.alt)})`);

    /* Sayfa içi bağlantılar: pay bir kez uygulanmalı. */
    for (const h of ["#katalog", "#firsat"]) {
      await s.evaluate(() => scrollTo(0, 0));
      await s.locator(`main a[href="${h}"]`).first().click();
      await dur(s);
      const top = await s.evaluate((h) => document.querySelector(h).getBoundingClientRect().top, h);
      bak(Math.abs(top - odak.alt) <= 2, `${en}px: ${h} bağlantısı başlığın hemen altına indi`,
        `${en}px: ${h} bağlantısı ${Math.round(top)}px'e indi (beklenen ${Math.round(odak.alt)})`);
    }
    await c.close();
  }

  /* ═══════ 10. Favicon ═══════ */
  bolum("10 — favicon.ico");
  {
    const y = await fetch(B + "/favicon.ico");
    const buf = Buffer.from(await y.arrayBuffer());
    bak(y.status === 200, "/favicon.ico → 200", `/favicon.ico → ${y.status}`);
    // ICO başlığı: 00 00 01 00, ardından görüntü sayısı; her girdi 16 bayt
    const ico = buf.readUInt16LE(0) === 0 && buf.readUInt16LE(2) === 1;
    const boyutlar = ico
      ? Array.from({ length: buf.readUInt16LE(4) }, (_, i) => buf[6 + i * 16] || 256)
      : [];
    bak(ico && [16, 32, 48].every((n) => boyutlar.includes(n)),
      `gerçek ICO, boyutlar ${boyutlar.join("/")}`, `ICO değil ya da boyut eksik: ${boyutlar}`);
    const html = await (await fetch(B + "/")).text();
    bak(/<link rel="icon" href="\/favicon\.ico[^"]*"/.test(html),
      "sayfa başlığında favicon bağlantısı var", "favicon <link> yok");
  }

  /* ═══════ 11. Konsol ═══════ */
  bolum("11 — Konsol ve ağ: bütün sayfalar boyunca");
  bak(hatalar.length === 0, "hiç hata yok (hariç tutma listesi yok)",
    `${hatalar.length} hata:\n      ${[...new Set(hatalar)].slice(0, 8).join("\n      ")}`);
} finally {
  if (tarayici) await tarayici.close();
}

console.log(`\n${g} geçti, ${k} kaldı${bilinenSayi ? `, ${bilinenSayi} bilinen hata sürüyor (sonuca sayılmıyor)` : ""}`);
process.exit(k ? 1 : 0);
