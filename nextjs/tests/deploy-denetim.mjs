/* =====================================================================
   Deploy sonrası denetim — preview ya da production URL'ine karşı.

   Yerel sınamalardan farkı: bu, Vercel'in GERÇEK çalışma ortamını
   ölçüyor. Yerelde geçen şeyler orada geçmeyebilir — proxy.ts edge'de
   çalışıyor mu, .vercelignore doğru yerde mi, dükkân bilgisi serverless
   fonksiyonun paketine girmiş mi. Bunların hiçbiri localhost'ta
   görünmüyor.

   Kullanım:
     ADRES=https://<url> ROL=canli node tests/deploy-denetim.mjs

   Sayfa boyutu gibi ÜRÜN KURALLARI koddan import ediliyor (lib/sayfalama),
   katalog BÜYÜKLÜĞÜ ise çalışma zamanında /api/saglik'ten okunuyor. İkisi
   de bilerek: biri kod sabiti, öbürü veri. Sabit yazılan her ikinci kopya
   er geç bayatlıyor — bu dosyada tam olarak öyle oldu (bkz. 2. bölüm).

   Deployment Protection açıksa bypass gerekir:
     ADRES=https://<url> BYPASS=<vercel-protection-bypass> node tests/deploy-denetim.mjs
   ===================================================================== */

import { SAYFA_BOYUTU, toplamSayfa } from "../src/lib/sayfalama.ts";

const B = (process.env.ADRES || "").replace(/\/$/, "");
const BYPASS = process.env.BYPASS || "";
/* Denetlenen adres hangi rolde çalışıyor? robots.txt beklentisi buna göre
   değişiyor: canlıda katalog indekslenmeli, preview'da HER ŞEY kapalı
   olmalı. Varsayılan "preview" — lib/ortam.ts ile aynı fail-safe. */
const ROL = process.env.ROL === "canli" ? "canli" : "preview";

if (!B) {
  console.error("ADRES verilmedi. Örnek:");
  console.error("  ADRES=https://meydan-sarkuteri.vercel.app ROL=canli node tests/deploy-denetim.mjs");
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

/* ═══════ 2. Sunucu render: ham HTML'de bir sayfa dilimi ═══════ */
bolum("2 — Ham HTML (JavaScript çalıştırmadan)");

/** Bir HTML gövdesindeki ızgara kartlarının sayısı. */
const kartSay = (h) => (h.match(/<article class="kart/g) || []).length;
/** YALNIZCA ızgara kartlarından toplanan ürün adresleri. "Düşen etiketler"
 *  şeridi ve "günün etiketi" statik kabuğun parçası — her sayfada aynılar,
 *  dilimlemeyle ilgileri yok. tests/sayfalama.mjs de böyle ayırıyor. */
const kartAdresleri = (h) => [...new Set(
  (h.match(/<article class="kart[\s\S]*?<\/article>/g) || [])
    .flatMap((k) => k.match(/\/urun\/u\d+/g) || []))];

/** Katalogdaki ürün sayısı — 4. bölümde /api/saglik'ten okunuyor. */
let urunSayisi = null;
let ilkSayfaHtml = "";
{
  const y = await iste("/");
  y.status === 200 ? ok("/ → 200") : no(`/ → ${y.status}`);

  const ham = await y.text();
  ilkSayfaHtml = ham;
  const kart = kartSay(ham);
  const yol = new Set(ham.match(/\/urun\/u\d+/g) || []);

  /* BU İKİ İDDİA BİR ZAMANLAR 470'İ SABİT YAZIYORDU ve sayfalama gelince
     (PR #2) bayatladı — betik aylarca kırık koştu. Artık sayfa boyutu
     lib/sayfalama'dan geliyor, yani kural TEK yerde yazılı. */
  kart === SAYFA_BOYUTU
    ? ok(`ham HTML'de ${kart} ürün kartı (1. sayfa dilimi)`)
    : no(`${kart} kart, beklenen ${SAYFA_BOYUTU}`);

  /* Kartların hepsi AYRI bir ürüne gitmeli — dilim içinde yineleme yok. */
  const kartYol = kartAdresleri(ham);
  kartYol.length === SAYFA_BOYUTU
    ? ok(`${kartYol.length} kartın her biri ayrı ürüne gidiyor`)
    : no(`${kartYol.length} benzersiz kart adresi, beklenen ${SAYFA_BOYUTU}`);

  /* SAYFADAKİ TOPLAM adres için neden ARALIK, neden tam sayı değil:
     ızgaranın üstünde "Düşen etiketler" şeridi var (page.tsx, en çok 12
     ürün) ve içeriği VERİYE bağlı — indirimli ürün sayısı azalırsa şerit
     kısalıyor, indirimli bir ürün ilk dilime de düşerse adresler
     örtüşüyor. Tam sayı yazmak, bir fiyat değişince kırılan sahte bir
     kesinlik olurdu. Üst sınır 20: şeridin 12'lik tavanına pay bırakıyor.
     tests/dukkan.mjs aynı kararı veriyor — ikisi bilerek aynı. */
  yol.size >= SAYFA_BOYUTU && yol.size <= SAYFA_BOYUTU + 20
    ? ok(`${yol.size} benzersiz ürün adresi (dilim + düşen etiketler şeridi)`)
    : no(`${yol.size} adres, beklenen ${SAYFA_BOYUTU}-${SAYFA_BOYUTU + 20}`);

  console.log(`     (ham HTML ${Math.round(ham.length / 1024)} KB)`);
}

/* ═══════ 2b. Sayfalama: dilimleme ve geçersiz ?sayfa ═══════ */
bolum("2b — Sayfalama (?sayfa)");
{
  /* Sayfalama YEREL sınamalarda (tests/sayfalama.mjs) zaten var, ama orası
     localhost'u ölçüyor. Burada gerçek ortamda da tuttuğunu görüyoruz:
     geçersiz ?sayfa'nın 404 vermesi proxy.ts'e bağlı ve proxy Vercel'de
     ayrı bir çalışma ortamında koşuyor (3. bölümdeki gerekçenin aynısı). */
  const iki = await iste("/?sayfa=2");
  iki.status === 200 ? ok("/?sayfa=2 → 200") : no(`/?sayfa=2 → ${iki.status}`);
  const ikiHtml = await iki.text();

  kartSay(ikiHtml) === SAYFA_BOYUTU
    ? ok(`/?sayfa=2 → ${SAYFA_BOYUTU} kart`)
    : no(`/?sayfa=2 → ${kartSay(ikiHtml)} kart, beklenen ${SAYFA_BOYUTU}`);

  const birinci = kartAdresleri(ilkSayfaHtml);
  const ikinci = kartAdresleri(ikiHtml);
  const ortak = birinci.filter((x) => ikinci.includes(x));
  ortak.length === 0
    ? ok("1. ve 2. sayfa farklı ürünler gösteriyor (kesişim yok)")
    : no(`${ortak.length} ürün iki sayfada da var — dilimleme bozuk`);

  /* JavaScript kapalıyken tek ilerleme yolu bu bağlantı. */
  /href="\/\?sayfa=2"/.test(ilkSayfaHtml)
    ? ok('1. sayfada gerçek "?sayfa=2" bağlantısı var (JS kapalı yol)')
    : no("1. sayfada ?sayfa=2 bağlantısı yok — JS kapalıyken ilerlenemez");

  /* sayfaCoz sözleşmesi: geçersiz, sıfır, negatif ve sayı olmayan → 404.
     Var olmayan yüksek sayfa da 404 (yinelenen boş sayfa üretilmemeli). */
  for (const q of ["99999", "0", "-1", "abc", "1.5", "2e1"]) {
    const y2 = await iste(`/?sayfa=${q}`);
    if (y2.status === 404) ok(`/?sayfa=${q} → 404`);
    else if (y2.status === 500) no(`/?sayfa=${q} → 500 — proxy Vercel'de ÇALIŞMIYOR`);
    else no(`/?sayfa=${q} → ${y2.status}, 404 bekleniyordu`);
  }

  /* "?sayfa=1" GEÇERLİ ama kanonik adres parametresiz "/" — sayfaCoz'un
     ve sayfaAdresi'nin sözleşmesi bu; yinelenen içeriği canonical kapatıyor. */
  const bir = await iste("/?sayfa=1");
  bir.status === 200 ? ok("/?sayfa=1 → 200 (geçerli)") : no(`/?sayfa=1 → ${bir.status}`);
  const birHtml = await bir.text();
  const kanonik = /<link rel="canonical" href="([^"]*)"/.exec(birHtml)?.[1] ?? "";
  /* Sözleşme "?sayfa DÜŞÜRÜLÜYOR mu", sondaki eğik çizgi değil: Next
     kanonik adresi tabanla birlikte üretiyor ve "https://…app" da
     "https://…app/" da kök yolu gösteriyor. Eğik çizgiye takılan bir
     iddia doğru davranışı yanlış bildirirdi — ölçüldü, tam öyle oldu. */
  const kanonikYol = kanonik ? new URL(kanonik).pathname : "";
  kanonik && !kanonik.includes("?") && (kanonikYol === "/" || kanonikYol === "")
    ? ok(`/?sayfa=1 canonical parametresiz köke bakıyor (${kanonik})`)
    : no(`/?sayfa=1 canonical "${kanonik}" — parametresiz kök adres beklenirdi`);
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
    /* Katalog büyüklüğü SABİT YAZILMIYOR. 470 bir kod sabiti değil, o günkü
       veri; esnaf bir ürün ekleyince sabit yazan her iddia kırmızıya döner
       ve kimse regresyon olmadığını anlamak için zaman harcar. Sayıyı
       buradan alıp 5. bölümde site haritasıyla karşılaştırıyoruz — asıl
       güvence "harita katalogla AYNI şeyi bildiriyor mu", mutlak sayı değil. */
    urunSayisi = v?.veritabani?.urunSayisi ?? null;
    console.log(`     ürün: ${urunSayisi ?? "?"}, anlık yedek: ${v?.anlikYedek?.urunSayisi ?? "?"}`);
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

  if (ROL === "preview") {
    /* Canlı olmayan bir ortam denetleniyor (dal preview'ı ya da ileride
       açılacak ikinci bir proje). Böyle bir kopya arama motoruna HİÇBİR
       ŞEY bildirmemeli — yoksa canlı siteyle yinelenen içerik doğar. */
    /Disallow:\s*\/\s*$/m.test(rm)
      ? ok('robots.txt "Disallow: /" — her şey kapalı')
      : no(`robots.txt her şeyi kapatmıyor — gelen: ${JSON.stringify(rm.trim())}`);
    /Sitemap:/i.test(rm)
      ? no("preview'da robots.txt sitemap bildiriyor — kapalı kopyanın haritası verilmemeli")
      : ok("robots.txt sitemap bildirmiyor");
  } else {
    for (const yol of ["/panel", "/giris", "/afis", "/api/"]) {
      rm.includes(`Disallow: ${yol}`)
        ? ok(`robots.txt "${yol}" engelliyor`)
        : no(`robots.txt "${yol}" ENGELLEMİYOR`);
    }
    /Sitemap:/i.test(rm) ? ok("robots.txt sitemap bildiriyor") : no("robots.txt sitemap bildirmiyor");
  }

  const s = await iste("/sitemap.xml");
  s.status === 200 ? ok("/sitemap.xml → 200") : no(`/sitemap.xml → ${s.status}`);
  const sm = await s.text();
  const url = (sm.match(/<url>/g) || []).length;
  /* Beklenen: 1 ana sayfa + katalogdaki her ürün. Sayı 4. bölümde
     ölçüldü, burada sabit yazılmıyor. Site haritası SAYFALANMIYOR —
     ana sayfa 30'ar dilim çizse de harita 470 ürünün tamamını bildirmek
     zorunda; "her ürün erişilebilir" güvencesi buradan geliyor. */
  if (urunSayisi === null) {
    uy("ürün sayısı okunamadı (/api/saglik), site haritası sayısı denetlenemiyor");
  } else {
    url === urunSayisi + 1
      ? ok(`sitemap'te ${url} adres (1 ana + ${urunSayisi} ürün)`)
      : no(`${url} adres, beklenen ${urunSayisi + 1} (1 ana + ${urunSayisi} ürün)`);

    /* Sayfa sayısı da tutarlı mı — dilimleme ile katalog aynı şeyi söylüyor mu. */
    console.log(`     (katalog ${urunSayisi} ürün → ${toplamSayfa(urunSayisi)} sayfa × ${SAYFA_BOYUTU})`);
  }
  /panel|giris|afis/.test(sm)
    ? no("sitemap'te /panel, /giris ya da /afis var — robots ile çelişiyor")
    : ok("sitemap'te panel/giris/afis yok");

  /* Sitemap tabanı denetlenen adresle uyuşuyor mu? Sabit taban yüzünden
     canlı olmayan kopyalar canlı sitenin adreslerini bildiriyordu. */
  const ilkLoc = (sm.match(/<loc>([^<]*)<\/loc>/) || [])[1] ?? "";
  ilkLoc.startsWith(B)
    ? ok(`sitemap tabanı denetlenen adresle aynı (${ilkLoc})`)
    : no(`sitemap tabanı "${ilkLoc}" ama denetlenen "${B}" — SITE_TABANI yanlış`);
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
