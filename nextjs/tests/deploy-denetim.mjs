/* =====================================================================
   Deploy sonrası denetim — preview ya da production URL'ine karşı.

   Yerel sınamalardan farkı: bu, Vercel'in GERÇEK çalışma ortamını
   ölçüyor. Yerelde geçen şeyler orada geçmeyebilir — proxy.ts edge'de
   çalışıyor mu, .vercelignore doğru yerde mi, dükkân bilgisi serverless
   fonksiyonun paketine girmiş mi. Bunların hiçbiri localhost'ta
   görünmüyor.

   Kullanım:
     ADRES=https://<preview-url> node tests/deploy-denetim.mjs

   Deployment Protection açıksa bypass gerekir:
     ADRES=https://<url> BYPASS=<vercel-protection-bypass> node tests/deploy-denetim.mjs
   ===================================================================== */

const B = (process.env.ADRES || "").replace(/\/$/, "");
const BYPASS = process.env.BYPASS || "";

if (!B) {
  console.error("ADRES verilmedi. Örnek:");
  console.error("  ADRES=https://meydan-sarkuteri-next.vercel.app node tests/deploy-denetim.mjs");
  process.exit(1);
}

let g = 0, k = 0, uyari = 0;
const ok = (m) => { console.log(`  ✓ ${m}`); g++; };
const no = (m) => { console.log(`  ✗ ${m}`); k++; };
const uy = (m) => { console.log(`  ⚠ ${m}`); uyari++; };
const bolum = (t) => console.log(`\n${"═".repeat(64)}\n${t}\n${"═".repeat(64)}`);

const basliklar = BYPASS ? { "x-vercel-protection-bypass": BYPASS } : {};
const iste = (yol, ek = {}) =>
  fetch(B + yol, { ...ek, headers: { ...basliklar, ...(ek.headers || {}) } });

console.log(`\nDENETLENEN: ${B}`);

/* ═══════ 1. Sızıntı: iç dosyalar sunuluyor mu ═══════ */
bolum("1 — İç dosyalar yayında mı (.vercelignore doğru yerde mi)");
{
  /* Bu bölüm bir GÜVENLİK nöbeti. Root Directory nextjs olan bir projede
     .vercelignore'un hangi dizinden okunduğu Vercel dokümanında açıkça
     yazmıyor; yanlış yerdeyse bu üç adres 200 döner. */
  const gizli = [
    "/db/schema.sql",
    "/scripts/yonetici-ekle.js",
    "/scripts/seed.js",
    "/.gecici-sifre.txt",
    "/tests/dukkan.mjs",
    "/.env.local",
  ];
  for (const yol of gizli) {
    const y = await iste(yol);
    y.status === 404
      ? ok(`${yol} → 404`)
      : no(`${yol} → ${y.status} — SIZINTI, .vercelignore yanlış yerde`);
  }
}

/* ═══════ 2. Sunucu render: ham HTML'de 470 ürün ═══════ */
bolum("2 — Ham HTML (JavaScript çalıştırmadan)");
{
  const y = await iste("/");
  y.status === 200 ? ok("/ → 200") : no(`/ → ${y.status}`);

  const ham = await y.text();
  const kart = (ham.match(/<article class="kart/g) || []).length;
  const yol = new Set(ham.match(/\/urun\/u\d+/g) || []);

  kart === 470 ? ok(`ham HTML'de ${kart} ürün kartı`) : no(`${kart} kart, 470 bekleniyordu`);
  yol.size === 470 ? ok(`${yol.size} benzersiz ürün adresi`) : no(`${yol.size} adres`);
  console.log(`     (ham HTML ${Math.round(ham.length / 1024)} KB)`);
}

/* ═══════ 3. Ürün adresleri: proxy.ts Vercel'de çalışıyor mu ═══════ */
bolum("3 — /urun/[id] durum kodları (proxy edge'de çalışıyor mu)");
{
  /* Yereldeki en kritik geçici çözüm bu. Next 16.2.12'de SSG rotasında
     notFound() 500 üretiyor; proxy.ts isteği sayfaya varmadan kesiyor.
     Vercel'de proxy ayrı bir çalışma ortamında koşuyor — burada da
     çalıştığını ÖLÇMEDEN varsayamayız. */
  const gecerli = await iste("/urun/u001");
  gecerli.status === 200 ? ok("/urun/u001 → 200") : no(`/urun/u001 → ${gecerli.status}`);

  for (const id of ["u999", "yok-boyle-bir-sey", "U001"]) {
    const y = await iste(`/urun/${id}`);
    if (y.status === 404) ok(`/urun/${id} → 404`);
    else if (y.status === 500) no(`/urun/${id} → 500 — proxy Vercel'de ÇALIŞMIYOR`);
    else no(`/urun/${id} → ${y.status}, 404 bekleniyordu`);
  }
}

/* ═══════ 4. API uçları ═══════ */
bolum("4 — API uçları");
{
  const s = await iste("/api/saglik");
  s.status === 200 ? ok("/api/saglik → 200") : no(`/api/saglik → ${s.status}`);
  if (s.status === 200) {
    const v = await s.json();
    console.log(`     ürün: ${v?.veritabani?.urunSayisi ?? "?"}, anlık yedek: ${v?.anlikYedek?.urunSayisi ?? "?"}`);
  }

  for (const yol of ["/api/yonetici/durum", "/api/yonetici/urunler"]) {
    const y = await iste(yol);
    y.status === 401 ? ok(`${yol} çerezsiz → 401`) : no(`${yol} → ${y.status}, 401 bekleniyordu`);
  }
  const p = await iste("/api/yonetici/urun", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "u001", fiyat: 1 }),
  });
  p.status === 401 ? ok("PATCH /api/yonetici/urun çerezsiz → 401") : no(`PATCH → ${p.status}`);

  const d = await iste("/api/yonetici/urun", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "u001" }),
  });
  d.status === 401 ? ok("DELETE /api/yonetici/urun çerezsiz → 401") : no(`DELETE → ${d.status}`);
}

/* ═══════ 5. robots.txt ve sitemap.xml ═══════ */
bolum("5 — robots.txt ve sitemap.xml");
{
  const r = await iste("/robots.txt");
  r.status === 200 ? ok("/robots.txt → 200") : no(`/robots.txt → ${r.status}`);
  const rm = await r.text();
  for (const yol of ["/panel", "/giris", "/afis", "/api/"]) {
    rm.includes(`Disallow: ${yol}`)
      ? ok(`robots.txt "${yol}" engelliyor`)
      : no(`robots.txt "${yol}" ENGELLEMİYOR`);
  }

  const s = await iste("/sitemap.xml");
  s.status === 200 ? ok("/sitemap.xml → 200") : no(`/sitemap.xml → ${s.status}`);
  const sm = await s.text();
  const url = (sm.match(/<url>/g) || []).length;
  url === 471 ? ok(`sitemap'te ${url} adres (1 ana + 470 ürün)`) : no(`${url} adres, 471 bekleniyordu`);
  /panel|giris|afis/.test(sm)
    ? no("sitemap'te /panel, /giris ya da /afis var — robots ile çelişiyor")
    : ok("sitemap'te panel/giris/afis yok");
}

/* ═══════ 6. Güvenlik başlıkları ═══════ */
bolum("6 — Güvenlik başlıkları");
{
  const y = await iste("/");
  const bekle = {
    "content-security-policy": "frame-ancestors 'none'",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "geolocation=()",
  };
  for (const [ad, parca] of Object.entries(bekle)) {
    const v = y.headers.get(ad);
    v && v.includes(parca) ? ok(`${ad} var`) : no(`${ad}: ${v ?? "YOK"}`);
  }
  const hsts = y.headers.get("strict-transport-security");
  hsts ? ok(`strict-transport-security: ${hsts}`) : uy("HSTS yok (Vercel genelde kendisi ekler)");
}

/* ═══════ 7. Önbellek davranışı ═══════ */
bolum("7 — x-vercel-cache (aynı adrese iki istek)");
{
  const bir = await iste("/");
  const birC = bir.headers.get("x-vercel-cache") ?? "(yok)";
  const iki = await iste("/");
  const ikiC = iki.headers.get("x-vercel-cache") ?? "(yok)";
  console.log(`     1. istek: ${birC}`);
  console.log(`     2. istek: ${ikiC}`);
  /HIT|STALE|PRERENDER/i.test(ikiC)
    ? ok(`ikinci istek önbellekten (${ikiC})`)
    : uy(`ikinci istek ${ikiC} — PPR/ISR beklendiği gibi çalışmıyor olabilir`);

  const u = await iste("/urun/u001");
  console.log(`     /urun/u001: ${u.headers.get("x-vercel-cache") ?? "(yok)"}`);
}

/* ═══════ 8. Dükkân bilgisi — ÖNBELLEK DOLDUKTAN SONRA DA ═══════ */
bolum("8 — Dükkân bilgisi (import edilen dukkan.json serverless'ta da var mı)");
{
  /* O1'in asıl riski burada ölçülüyor. Prerender derlemede çalıştığı için
     ilk istek her hâlükârda doğru gelir. Asıl soru, cacheLife("minutes")
     dolup yenileme SERVERLESS FONKSİYONUN İÇİNDE koştuğunda dosyanın hâlâ
     erişilebilir olup olmadığı. readFile + process.cwd() ile olmuyordu;
     import ile olmalı — ama ölçmeden bilinmez. */
  const oku = async () => {
    const ham = await (await iste("/")).text();
    return {
      adres: /Dikbıyık|Atatürk Bul/.test(ham),
      telefon: /tel:0362/.test(ham),
      serit: ham.includes("dukkan-serit"),
    };
  };

  const once = await oku();
  once.adres ? ok("adres görünüyor") : no("ADRES YOK — dukkan.json okunamıyor");
  once.telefon ? ok("telefon bağlantısı var") : no("TELEFON YOK");
  once.serit ? ok("üst şerit çiziliyor") : no("ŞERİT YOK");

  console.log("\n     revalidate penceresinin dolması için 70 sn bekleniyor...");
  await new Promise((r) => setTimeout(r, 70000));

  await iste("/");                       // yenilemeyi tetikle
  await new Promise((r) => setTimeout(r, 4000));
  const sonra = await oku();

  sonra.adres && sonra.telefon && sonra.serit
    ? ok("70 sn sonra dükkân bilgisi HÂLÂ yerinde (import serverless'ta da çalışıyor)")
    : no("70 sn sonra dükkân bilgisi KAYBOLDU — dosya fonksiyon paketinde yok");
}

console.log(`\n${"═".repeat(64)}`);
console.log(`DEPLOY DENETİMİ: ${g} geçti, ${k} kaldı${uyari ? `, ${uyari} uyarı` : ""}`);
console.log("═".repeat(64));
console.log("\nBuild log'undaki sayfa üretim süresi için:");
console.log("  vercel inspect <deployment-url> --logs | grep 'Generating static pages'");
process.exit(k === 0 ? 0 : 1);
