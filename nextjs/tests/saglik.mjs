/* =====================================================================
   Sistem Sağlık, Canlılık ve Dayanıklılık Sınamaları
   tests/saglik.mjs

   Çalıştırma: node --experimental-strip-types tests/saglik.mjs
   ===================================================================== */

const B = process.env.ADRES || "http://localhost:3001";

let g = 0, k = 0;
const ok = (m) => { console.log(`  ✓ ${m}`); g++; };
const no = (m) => { console.log(`  ✗ ${m}`); k++; };
const bolum = (t) => console.log(`\n${"═".repeat(62)}\n${t}\n${"═".repeat(62)}`);

/* ═══════ 1. /api/saglik Sağlık Ucu ═══════ */
bolum("1 — /api/saglik Sağlık Uç Noktası");
{
  try {
    const res = await fetch(`${B}/api/saglik`);
    res.status === 200 ? ok("GET /api/saglik 200 OK") : no(`durum: ${res.status}`);

    const veri = await res.json();
    typeof veri.durum === "string" ? ok(`durum alanı mevcut ("${veri.durum}")`) : no("durum alanı yok");
    typeof veri.toplamSureMs === "number" ? ok(`toplam süre ölçüldü (${veri.toplamSureMs} ms)`) : no("toplamSureMs yok");
    
    veri.veritabani?.bagli !== undefined
      ? ok(`veritabanı durumu: bagli=${veri.veritabani.bagli}, gecikme=${veri.veritabani.gecikmeMs} ms, urunSayisi=${veri.veritabani.urunSayisi}`)
      : no("veritabani nesnesi eksik");

    veri.anlikYedek?.mevcut === true
      ? ok(`anlık yedek hazır: ${veri.anlikYedek.urunSayisi} ürün`)
      : no("anlikYedek eksik");

    const cc = res.headers.get("cache-control") ?? "";
    cc.includes("no-store") ? ok("sağlık ucu önbelleklenmiyor (no-store)") : no(`Cache-Control: ${cc}`);
  } catch (e) {
    no(`saglik ucu testi patladı: ${e.message}`);
  }
}

/* ═══════ 2. Robots.txt ve Sitemap.xml ═══════ */
bolum("2 — Robots.txt ve Sitemap.xml Doğrulaması");
{
  try {
    const res = await fetch(`${B}/robots.txt`);
    res.status === 200 ? ok("/robots.txt 200 OK") : no(`/robots.txt status: ${res.status}`);
    const txt = await res.text();
    txt.includes("/panel") && txt.includes("/giris") && txt.includes("/afis")
      ? ok("/panel, /giris, /afis disallow kuralları mevcut")
      : no("robots.txt kuralları eksik");
    txt.includes("sitemap.xml") ? ok("sitemap referansı mevcut") : no("sitemap referansı yok");
  } catch (e) {
    no(`robots.txt testi patladı: ${e.message}`);
  }

  try {
    const res = await fetch(`${B}/sitemap.xml`);
    res.status === 200 ? ok("/sitemap.xml 200 OK") : no(`/sitemap.xml status: ${res.status}`);
    const txt = await res.text();
    txt.includes("<loc>") && txt.includes("/urun/")
      ? ok("sitemap ürün bağlantılarını içeriyor")
      : no("sitemap içeriği geçersiz");
  } catch (e) {
    no(`sitemap.xml testi patladı: ${e.message}`);
  }
}

/* ═══════ 3. PWA Manifest & Varlıklar ═══════ */
bolum("3 — PWA Manifest ve İkonlar");
{
  try {
    const res = await fetch(`${B}/manifest.json`);
    res.status === 200 ? ok("/manifest.json 200 OK") : no(`/manifest.json status: ${res.status}`);
    const json = await res.json();
    json.name === "Meydan Şarküteri" ? ok(`uygulama adı doğru: "${json.name}"`) : no("name yanlış");
    json.icons?.length >= 2 ? ok(`${json.icons.length} adet PWA ikonu tanımlı`) : no("ikonlar eksik");
  } catch (e) {
    no(`manifest testi patladı: ${e.message}`);
  }
}

/* ═══════ 4. 301 Yönlendirmeleri (.html) ═══════ */
bolum("4 — Eski .html Adresleri Kalıcı Yönlendirmeleri (301/308)");
{
  const yollar = [
    ["/index.html", "/"],
    ["/giris.html", "/giris"],
    ["/panel.html", "/panel"],
    ["/afis.html", "/afis"],
  ];

  for (const [eski, yeni] of yollar) {
    try {
      const res = await fetch(`${B}${eski}`, { redirect: "manual" });
      const kod = res.status;
      const hedef = res.headers.get("location");
      (kod === 301 || kod === 308) && (hedef === yeni || hedef?.endsWith(yeni))
        ? ok(`${eski} → ${kod} → ${yeni}`)
        : no(`${eski} yönlenmedi (status: ${kod}, location: ${hedef})`);
    } catch (e) {
      no(`${eski} yönlendirme testi patladı: ${e.message}`);
    }
  }
}

/* ═══════ 5. Güvenlik Başlıkları ═══════ */
bolum("5 — Güvenlik Başlıkları Kontrolü");
{
  try {
    const res = await fetch(`${B}/`);
    const h = res.headers;
    h.get("content-security-policy")?.includes("frame-ancestors 'none'")
      ? ok("CSP frame-ancestors: 'none' (tıklama hırsızlığı engelli)")
      : no("CSP eksik veya yetersiz");
    h.get("x-frame-options") === "DENY"
      ? ok("X-Frame-Options: DENY")
      : no("X-Frame-Options eksik");
    h.get("x-content-type-options") === "nosniff"
      ? ok("X-Content-Type-Options: nosniff")
      : no("X-Content-Type-Options eksik");
  } catch (e) {
    no(`güvenlik başlıkları testi patladı: ${e.message}`);
  }
}

console.log(`\n${"═".repeat(62)}`);
console.log(`SAĞLIK VE DAYANIKLILIK SONUÇ: ${g} geçti, ${k} kaldı`);
if (k > 0) process.exit(1);
