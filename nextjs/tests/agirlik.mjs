/* =====================================================================
   Sayfa ağırlığı ölçümü — ve eşik nöbeti.

   İKİ SÜRÜMÜ AYNI BETİKLE ölçüyor: kıyas ancak yöntem birebir aynıysa
   anlamlı. Daha önce "2151 KB / 63 istek" ile "1387 KB / 18 istek"
   karşılaştırılmıştı ama eski sayının hangi yöntemle alındığı kayıtlı
   değildi; o kıyas aslında dayanaksızdı.

   Ölçüm: gerçek tarayıcı, boş önbellek, ağ üzerinden inen her yanıtın
   çözülmüş gövde boyutu. Sayfa "networkidle" olana kadar bekleniyor,
   ardından tembel yüklenen görseller için sayfa sonuna kaydırılıyor —
   yoksa 470 kartın görselleri sayıma hiç girmez ve ölçüm iyimser çıkar.

   Kullanım:
     node tests/agirlik.mjs                      # Next, :3000
     ADRES=http://localhost:8080 node tests/agirlik.mjs   # eski site
     ESIK_KB=1200 ESIK_ISTEK=40 node tests/agirlik.mjs    # nöbet olarak

   ESIK_KB / ESIK_ISTEK verilirse betik eşiği aşınca 1 ile çıkıyor:
   ağırlık sessizce şişemesin.
   ===================================================================== */

import { chromium } from "playwright-core";

const B = process.env.ADRES || "http://localhost:3000";
const CHROME = process.env.CHROME_YOLU || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const ESIK_KB = process.env.ESIK_KB ? Number(process.env.ESIK_KB) : null;
const ESIK_ISTEK = process.env.ESIK_ISTEK ? Number(process.env.ESIK_ISTEK) : null;
const GENISLIK = Number(process.env.GENISLIK || 1280);

const kb = (b) => Math.round(b / 1024);

const tarayici = await chromium.launch({ executablePath: CHROME, headless: true });
const baglam = await tarayici.newContext({
  viewport: { width: GENISLIK, height: 900 },
  bypassCSP: false,
});
const sayfa = await baglam.newPage();

const istekler = [];
sayfa.on("response", async (yanit) => {
  let boyut = 0;
  try {
    boyut = (await yanit.body()).length;
  } catch {
    /* yönlendirme ya da gövdesiz yanıt */
  }
  istekler.push({
    url: yanit.url(),
    tur: yanit.request().resourceType(),
    durum: yanit.status(),
    boyut,
  });
});

await sayfa.goto(B + "/", { waitUntil: "networkidle", timeout: 180000 });
/* Tembel görseller: sona kaydır, sonra ağ dursun diye bekle. Bu olmadan
   470 kartın görselleri hiç indirilmez ve ölçüm gerçeği yansıtmaz. */
await sayfa.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await sayfa.waitForTimeout(2500);
try {
  await sayfa.waitForLoadState("networkidle", { timeout: 30000 });
} catch {
  /* sürekli açık bağlantı (dev HMR) varsa networkidle hiç gelmez */
}

const toplam = istekler.reduce((t, i) => t + i.boyut, 0);
const turler = {};
for (const i of istekler) {
  turler[i.tur] ??= { adet: 0, bayt: 0 };
  turler[i.tur].adet++;
  turler[i.tur].bayt += i.boyut;
}

console.log(`\nADRES   : ${B}/`);
console.log(`GENİŞLİK: ${GENISLIK}px`);
console.log(`\nTOPLAM  : ${kb(toplam)} KB / ${istekler.length} istek\n`);
console.log("tür            adet       KB");
for (const [t, v] of Object.entries(turler).sort((a, b) => b[1].bayt - a[1].bayt)) {
  console.log(`${t.padEnd(14)} ${String(v.adet).padStart(4)}  ${String(kb(v.bayt)).padStart(7)}`);
}

const belge = istekler.find((i) => i.tur === "document");
console.log(`\nham HTML: ${kb(belge?.boyut ?? 0)} KB`);

const betikler = istekler.filter((i) => i.tur === "script");
console.log(`\nen ağır betikler:`);
for (const i of [...betikler].sort((a, b) => b.boyut - a.boyut).slice(0, 6)) {
  console.log(`  ${String(kb(i.boyut)).padStart(5)} KB  ${i.url.split("/").pop().slice(0, 46)}`);
}

const rsc = istekler.filter((i) => i.url.includes("_rsc=") || i.tur === "fetch");
if (rsc.length) {
  console.log(`\nRSC / fetch: ${rsc.length} istek, ${kb(rsc.reduce((t, i) => t + i.boyut, 0))} KB`);
}

await tarayici.close();

if (ESIK_KB !== null || ESIK_ISTEK !== null) {
  const sorun = [];
  if (ESIK_KB !== null && kb(toplam) > ESIK_KB) {
    sorun.push(`ağırlık ${kb(toplam)} KB > eşik ${ESIK_KB} KB`);
  }
  if (ESIK_ISTEK !== null && istekler.length > ESIK_ISTEK) {
    sorun.push(`istek ${istekler.length} > eşik ${ESIK_ISTEK}`);
  }
  console.log("");
  if (sorun.length) {
    for (const x of sorun) console.log(`  ✗ ${x}`);
    console.log("\nAĞIRLIK EŞİĞİ AŞILDI");
    process.exit(1);
  }
  console.log(`  ✓ eşiklerin altında (${kb(toplam)} KB ≤ ${ESIK_KB}, ${istekler.length} ≤ ${ESIK_ISTEK})`);
}
