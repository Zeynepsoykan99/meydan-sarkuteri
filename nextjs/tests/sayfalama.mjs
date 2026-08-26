/* =====================================================================
   Ana sayfa sayfalaması.

   Neyi koruyor: 470 kartın tamamı sunucuda çiziliyordu, ham HTML 634 KB
   idi. Artık sayfa başına 30 çiziliyor; kaydırdıkça otomatik 30'ar
   ekleniyor, 150'de durup düğmeye bırakıyor.

   Buradaki sınamaların çoğu bir GERİLEME NÖBETİ: sayfalama sessizce
   bozulursa (örneğin nöbetçi hiç görünmezse, ya da süzgeç etkinken de
   dilimlenmeye devam ederse) kullanıcı ürünlerin çoğunu hiç göremez ve
   bu hata sayfada hata olarak görünmez.
   ===================================================================== */

import { chromium } from "playwright-core";
import { SAYFA_BOYUTU, OTOMATIK_SINIR } from "../src/lib/sayfalama.ts";

/* 3001 — 3000 DEĞİL. Sınamalar README'deki üretim derlemesine bakıyor
   (`npm run build && npm start -- -p 3001`); 3000 `next dev`'in portu.
   Bu dosya 3000'de kalırsa iki şey oluyor, ikincisi daha kötü:
   dev sunucusu kapalıyken ECONNREFUSED ile çöküyor, AÇIKKEN sessizce
   yanlış derlemeyi ölçüyor — dev'de PPR ön-render'ı ve üretim paketi yok,
   yani "geçti" demesi hiçbir şey kanıtlamıyor. Diğer beş sınama dosyası
   zaten 3001'de. */
const B = process.env.ADRES || "http://localhost:3001";
const CHROME = process.env.CHROME_YOLU || "C:/Program Files/Google/Chrome/Application/chrome.exe";

let g = 0, k = 0;
const ok = (m) => { console.log(`  ✓ ${m}`); g++; };
const no = (m) => { console.log(`  ✗ ${m}`); k++; };
const bolum = (t) => console.log(`\n${"═".repeat(62)}\n${t}\n${"═".repeat(62)}`);

/* ═══════ 1. Ham HTML — JavaScript çalıştırmadan ═══════ */
bolum("1 — Ham HTML (sunucu render)");
{
  const say = (h) => (h.match(/<article class="kart/g) || []).length;

  const ilk = await (await fetch(B + "/")).text();
  say(ilk) === 30 ? ok(`/ → ham HTML'de 30 kart`) : no(`/ → ${say(ilk)} kart`);

  const iki = await (await fetch(B + "/?sayfa=2")).text();
  say(iki) === 30 ? ok("/?sayfa=2 → ham HTML'de 30 kart") : no(`/?sayfa=2 → ${say(iki)} kart`);

  /* İki sayfa AYNI ürünleri göstermemeli — dilimleme gerçekten çalışıyor mu.
     Kimlikler YALNIZCA ızgaradaki kartlardan toplanıyor: "Düşen etiketler"
     şeridi ve "günün etiketi" statik kabuğun parçası, her sayfada aynı
     ürünleri gösteriyorlar ve dilimlemeyle ilgileri yok. */
  const idler = (h) => {
    const kartlar = h.match(/<article class="kart[\s\S]*?<\/article>/g) || [];
    return [...new Set(kartlar.flatMap((k) => k.match(/\/urun\/u\d+/g) || []))];
  };
  const ortak = idler(ilk).filter((x) => idler(iki).includes(x));
  ortak.length === 0
    ? ok("1. ve 2. sayfa farklı ürünler gösteriyor (kesişim yok)")
    : no(`${ortak.length} ürün iki sayfada da var — dilimleme bozuk`);

  const son = await (await fetch(B + "/?sayfa=16")).text();
  say(son) === 20 ? ok("/?sayfa=16 (son sayfa) → 20 kart") : no(`son sayfa ${say(son)} kart`);

  /* JavaScript kapalıyken tek ilerleme yolu bu bağlantı */
  ilk.includes("Daha fazla göster") && /href="\/\?sayfa=2"/.test(ilk)
    ? ok('ham HTML\'de çalışan "Daha fazla göster" bağlantısı (href=/?sayfa=2)')
    : no("ham HTML'de sayfalama bağlantısı yok — JavaScript kapalıyken çıkmaz sokak");

  ilk.includes('aria-label="Sayfalar"')
    ? ok("ham HTML'de sayfa gezinme bağlantıları var")
    : no("sayfa gezinmesi yok");
}

/* ═══════ 2. Sayfa sınırları ═══════ */
bolum("2 — Olmayan sayfa → 404");
{
  for (const [yol, bekle] of [
    ["/?sayfa=1", 200], ["/?sayfa=16", 200],
    ["/?sayfa=17", 404], ["/?sayfa=99", 404],
    ["/?sayfa=abc", 404], ["/?sayfa=0", 404], ["/?sayfa=-1", 404],
  ]) {
    const y = await fetch(B + yol);
    y.status === bekle
      ? ok(`${yol} → ${y.status}`)
      : no(`${yol} → ${y.status}, ${bekle} bekleniyordu`);
  }
}

/* ═══════ 3. SEO: canonical ve rel next/prev ═══════ */
bolum("3 — Sayfalanmış dizi etiketleri");
{
  const al = async (yol) => {
    const h = await (await fetch(B + yol)).text();
    return {
      canonical: (h.match(/rel="canonical" href="([^"]*)"/) || [])[1] ?? null,
      prev: (h.match(/<link rel="prev" href="([^"]*)"/) || [])[1] ?? null,
      next: (h.match(/<link rel="next" href="([^"]*)"/) || [])[1] ?? null,
    };
  };

  const bir = await al("/");
  bir.canonical?.endsWith(".app") ? ok("1. sayfa canonical parametresiz") : no(`canonical: ${bir.canonical}`);
  bir.prev === null ? ok("1. sayfada rel=prev yok") : no(`prev: ${bir.prev}`);
  bir.next?.endsWith("?sayfa=2") ? ok("1. sayfada rel=next → ?sayfa=2") : no(`next: ${bir.next}`);

  const uc = await al("/?sayfa=3");
  uc.canonical?.endsWith("?sayfa=3")
    ? ok("3. sayfanın canonical'i KENDİSİNİ gösteriyor")
    : no(`canonical: ${uc.canonical}`);
  uc.prev?.endsWith("?sayfa=2") ? ok("3. sayfada rel=prev → ?sayfa=2") : no(`prev: ${uc.prev}`);
  uc.next?.endsWith("?sayfa=4") ? ok("3. sayfada rel=next → ?sayfa=4") : no(`next: ${uc.next}`);

  const son = await al("/?sayfa=16");
  son.next === null ? ok("son sayfada rel=next yok") : no(`next: ${son.next}`);
}

/* ═══════ 4-6. Tarayıcı ═══════ */
const t = await chromium.launch({ executablePath: CHROME, headless: true });
try {
  /* ---- 4. Otomatik yükleme ve düğme ---- */
  bolum("4 — Kaydırdıkça otomatik yükleme, 150'de düğme");
  {
    const c = await t.newContext({ viewport: { width: 1280, height: 900 } });
    const s = await c.newPage();
    const hata = [];
    s.on("pageerror", (e) => hata.push(e.message));
    await s.goto(B + "/", { waitUntil: "domcontentloaded", timeout: 120000 });
    await s.waitForTimeout(2500);

    const kart = () => s.locator(".kart").count();
    const dugme = () => s.locator('a:has-text("Daha fazla göster")').count();

    (await kart()) === 30 ? ok("ilk yüklemede 30 kart") : no(`${await kart()} kart`);
    (await dugme()) === 0
      ? ok("hidrasyondan sonra düğme gizli (otomatik yükleme devrede)")
      : no("düğme daha 30 üründe görünüyor");

    /* Sona kaydırdıkça otomatik yükleme. Ara adımların TAM sırası
       zamanlamaya bağlı: ziyaretçi sayfanın sonuna sabitlendiğinde
       tarayıcı onu orada tutuyor ve bir gözlem penceresine iki dilim
       sığabiliyor. Bu yüzden dizilimin kendisi değil, GARANTİLER
       sınanıyor: 30'un katlarıyla büyüsün, otomatik yükleme 150'yi
       AŞMASIN, sonunda tam 150'de dursun. */
    const adimlar = [30];
    for (let i = 0; i < 8; i++) {
      await s.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await s.waitForTimeout(700);
      const n = await kart();
      if (n !== adimlar[adimlar.length - 1]) adimlar.push(n);
      if (n >= 150) break;
    }

    adimlar.every((n) => n % 30 === 0)
      ? ok(`otomatik yükleme 30'un katlarıyla ilerliyor (${adimlar.join(" → ")})`)
      : no(`30'un katı olmayan adım var: ${adimlar.join(" → ")}`);

    adimlar.length > 1
      ? ok(`kaydırınca otomatik yükleniyor (${adimlar.length - 1} dilim)`)
      : no("kaydırma hiç yükleme tetiklemedi");

    adimlar.every((n) => n <= 150)
      ? ok("otomatik yükleme 150'yi aşmadı")
      : no(`sınır aşıldı: ${adimlar.join(" → ")}`);

    (await kart()) === 150 ? ok("tam 150'de durdu") : no(`${await kart()} kartta durdu`);

    /* Fazladan kaydırma artık yeni kart getirmemeli */
    for (let i = 0; i < 3; i++) {
      await s.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await s.waitForTimeout(800);
    }
    (await kart()) === 150
      ? ok("150'den sonra otomatik yükleme durdu (sonsuz kaydırma yok)")
      : no(`${await kart()} kart — otomatik yükleme durmamış`);

    (await dugme()) === 1 ? ok("150'de düğme belirdi") : no("düğme yok");

    const href = await s.locator('a:has-text("Daha fazla göster")').getAttribute("href");
    href === "/?sayfa=6"
      ? ok(`düğme gerçek bir bağlantı, adresi doğru (${href})`)
      : no(`düğme href="${href}", "/?sayfa=6" bekleniyordu`);

    await s.locator('a:has-text("Daha fazla göster")').click();
    await s.waitForTimeout(1200);
    (await kart()) === 180 ? ok("düğmeye basınca 180 kart") : no(`${await kart()} kart`);

    hata.length === 0 ? ok("JS hatası yok") : no(`${hata.length}: ${hata[0]}`);
    await c.close();
  }

  /* ---- 5. Süzgeçler sayfalamayı devre dışı bırakıyor mu ---- */
  bolum("5 — Süzgeç etkinken sayfalama devre dışı");
  {
    const c = await t.newContext({ viewport: { width: 1280, height: 900 } });
    const s = await c.newPage();
    await s.goto(B + "/", { waitUntil: "domcontentloaded", timeout: 120000 });
    await s.waitForTimeout(2500);

    /* Arama: "çikolata" → 38 sonuç, hepsi görünmeli */
    await s.fill('input[type="search"], .arama input', "çikolata");
    await s.waitForTimeout(900);
    const aramaKart = await s.locator(".kart").count();
    aramaKart === 38
      ? ok(`arama "çikolata" → 38 sonucun hepsi görünüyor`)
      : no(`arama → ${aramaKart} kart, 38 bekleniyordu`);

    (await s.locator('a:has-text("Daha fazla göster")').count()) === 0
      ? ok("süzgeç etkinken sayfalama bağlantısı yok")
      : no("süzgeç etkinken sayfalama araya giriyor");

    /* Aramayı temizle → sayfalama geri gelmeli, başa dönmeli */
    await s.fill('input[type="search"], .arama input', "");
    await s.waitForTimeout(900);
    (await s.locator(".kart").count()) === 30
      ? ok("arama temizlenince sayfalama başa döndü (30 kart)")
      : no(`${await s.locator(".kart").count()} kart`);

    /* Reyon süzgeci: o reyonun TÜM ürünleri */
    await s.locator(".reyon").nth(1).click();
    await s.waitForTimeout(900);
    const reyonKart = await s.locator(".kart").count();
    const rozet = await s.locator(".reyon").nth(1).locator(".reyon-adet").textContent();
    reyonKart === Number(rozet)
      ? ok(`reyon süzgeci → rozetteki ${rozet} ürünün hepsi görünüyor`)
      : no(`reyonda ${reyonKart} kart ama rozet ${rozet} diyor`);

    await c.close();
  }

  /* ---- 6. Ölçüler ve erişilebilirlik ---- */
  bolum("6 — Ölçüler (320/375/1280) ve dokunma hedefleri");
  for (const en of [320, 375, 1280]) {
    const c = await t.newContext({ viewport: { width: en, height: 900 } });
    const s = await c.newPage();
    await s.goto(B + "/", { waitUntil: "domcontentloaded", timeout: 120000 });
    await s.waitForTimeout(2000);

    const r = await s.evaluate(() => {
      const de = document.documentElement;
      const kucuk = [];
      for (const e of document.querySelectorAll('a[href], button, input, select')) {
        if (e.closest(".kart")) continue;
        const b = e.getBoundingClientRect();
        if (b.width > 0 && b.height > 0 && (b.height < 44 || b.width < 44)) {
          kucuk.push(`${(e.textContent || e.tagName).trim().slice(0, 18)} ${Math.round(b.width)}x${Math.round(b.height)}`);
        }
      }
      return { tasma: de.scrollWidth > de.clientWidth, w: de.scrollWidth, cw: de.clientWidth,
               kart: document.querySelectorAll(".kart").length, kucuk };
    });

    !r.tasma ? ok(`${en}px: yatay taşma yok`) : no(`${en}px: TAŞMA ${r.w}/${r.cw}`);
    r.kart === 30 ? ok(`${en}px: 30 kart`) : no(`${en}px: ${r.kart} kart`);
    r.kucuk.length === 0
      ? ok(`${en}px: dokunma hedefleri ≥44px`)
      : no(`${en}px küçük: ${r.kucuk.join(" | ")}`);
    await c.close();
  }

/* ═══════ 7. Otomatik yükleme MOBİLDE de çalışıyor ═══════
   Gerileme sınaması. Önce IntersectionObserver kullanıyorduk; IO yalnızca
   kesişim DEĞİŞİNCE haber verdiği için sayfa sonuna tek hamlede
   atlandığında (mobil ivmeli kaydırma) nöbetçi atlanıyor ve otomatik
   yükleme sessizce ölüyordu. Kusur ızgaranın altındaki kuyruk
   yüksekliğine bağlıydı: 1280px'te çalışıyor, 390px'te çalışmıyordu. O
   yüzden DAR ekranda ve TEK HAMLEDE atlayarak ölçüyöruz — kusurun
   ortaya çıktığı tam koşul. */
bolum("7 — Otomatik yükleme dar ekranda ve ani kaydırmada");
{
  const c = await t.newContext({ viewport: { width: 390, height: 844 } });
  const s = await c.newPage();
  const hata = [];
  s.on("pageerror", (e) => hata.push(e.message));
  await s.goto(B + "/", { waitUntil: "networkidle" });
  const say = () => s.evaluate(() => document.querySelectorAll(".kart").length);

  const adimlar = [await say()];
  for (let i = 0; i < 12; i++) {
    await s.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await s.waitForTimeout(700);
    const n = await say();
    if (n !== adimlar[adimlar.length - 1]) adimlar.push(n);
    if (n >= OTOMATIK_SINIR) break;
  }
  const sonAdet = adimlar[adimlar.length - 1];

  sonAdet === OTOMATIK_SINIR
    ? ok(`390px: ani kaydırmada ${OTOMATIK_SINIR}'ye ulaştı (${adimlar.join(" → ")})`)
    : no(`390px: ${sonAdet} kartta takıldı (${adimlar.join(" → ")}) — nöbetçi atlanıyor`);
  adimlar.every((n) => n % SAYFA_BOYUTU === 0)
    ? ok("390px: dilimler 30'un katı")
    : no(`390px: dilim dışı adım (${adimlar.join(" → ")})`);
  adimlar.every((n) => n <= OTOMATIK_SINIR)
    ? ok(`390px: ${OTOMATIK_SINIR} sınırı aşılmadı`)
    : no(`390px: sınır aşıldı (${adimlar.join(" → ")})`);

  const dugme = await s.evaluate(() =>
    document.querySelector('a[href^="/?sayfa="]')?.getAttribute("href") ?? null);
  dugme ? ok(`390px: sınırda düğme belirdi (${dugme})`) : no("390px: düğme yok");
  hata.length === 0 ? ok("390px: JS hatası yok") : no(`390px JS hatası: ${hata.join(" | ")}`);
  await c.close();
}

/* ═══════ 8. Geri dönünce kaldığı yer ═══════
   KARAR: Ziyaretçi ürüne girip geri döndüğünde kaldığı yere düşüyor —
   açtığı dilim sayısı da kaydırma konumu da korunuyor. Alternatif
   (başa dönmek) sayfalamayı bir cezaya çevirirdi: 150 ürüne kadar
   inmiş biri tek bir ürüne baktığı için her şeyi baştan kaydırmak
   zorunda kalırdı. Bunu App Router'ın geri/ileri gezinmede istemci
   ağacını önbellekten geri kurması sağlıyor; bedava değil, DAVRANIŞ
   olduğu için burada kilitleniyor. */
bolum("8 — Ürüne girip geri dönünce kaldığı yer korunuyor");
{
  for (const [ad, derinlik] of [["ilk dilim", 0], ["150 karta inmişken", 8]]) {
    const c = await t.newContext({ viewport: { width: 390, height: 844 } });
    const s = await c.newPage();
    await s.goto(B + "/", { waitUntil: "networkidle" });
    for (let i = 0; i < derinlik; i++) {
      await s.evaluate(() => scrollTo(0, document.body.scrollHeight));
      await s.waitForTimeout(700);
    }
    const oncekiKart = await s.evaluate(() => document.querySelectorAll(".kart").length);
    const hedef = await s.evaluate(() => {
      const a = [...document.querySelectorAll(".kart a[href^='/urun/']")];
      const e = a[a.length - 1];
      e.scrollIntoView({ block: "center" });
      return e.getAttribute("href");
    });
    await s.waitForTimeout(400);
    const ayrilisY = await s.evaluate(() => Math.round(scrollY));

    await s.click(`.kart a[href="${hedef}"]`);
    await s.waitForURL("**" + hedef, { timeout: 15000 });
    await s.waitForTimeout(700);
    await s.goBack({ waitUntil: "networkidle" });
    await s.waitForTimeout(2000);

    const r = await s.evaluate((href) => {
      const e = document.querySelector(`.kart a[href="${href}"]`);
      const b = e ? e.getBoundingClientRect() : null;
      return {
        kart: document.querySelectorAll(".kart").length,
        y: Math.round(scrollY),
        ekranda: !!b && b.top > -80 && b.top < innerHeight,
        top: b ? Math.round(b.top) : null,
      };
    }, hedef);

    /* Dilim sayısı korunmalı; sona sabitlenmiş ziyaretçide bir dilim
       daha gelmesi meşru, ama GERİYE gitmemeli. */
    r.kart >= oncekiKart
      ? ok(`${ad}: dilim korundu (${oncekiKart} → ${r.kart} kart)`)
      : no(`${ad}: dilim kaybedildi (${oncekiKart} → ${r.kart} kart)`);
    Math.abs(r.y - ayrilisY) < 200
      ? ok(`${ad}: kaydırma konumu korundu (y=${ayrilisY} → ${r.y})`)
      : no(`${ad}: konum kayboldu (y=${ayrilisY} → ${r.y})`);
    r.ekranda
      ? ok(`${ad}: tıklanan kart ekranda (top=${r.top})`)
      : no(`${ad}: tıklanan kart ekran dışı (top=${r.top})`);
    await c.close();
  }
}

} finally {
  await t.close();
}

console.log(`\n${"═".repeat(62)}\nSAYFALAMA SONUÇ: ${g} geçti, ${k} kaldı`);
process.exit(k === 0 ? 0 : 1);
