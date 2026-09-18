/* =====================================================================
   Panel — TARAYICI sınamaları
   tests/panel.mjs

   Çalıştırma:
     npm i --no-save playwright-core
     npm run build && npm start -- -p 3001
     node --experimental-strip-types tests/panel.mjs

   NEDEN VAR: 26 Ağustos 2026'da canlıda bulunan hata bu boşluğun
   ürünüydü. Bir ürün silindikten SONRA ikinciyi silmeye kalkınca onay
   modalı "Siliniyor..." yazıp kilitli açılıyor, hiç istek göndermiyor ve
   Vazgeç/Esc de çalışmadığı için kullanıcı sayfayı yenilemeden
   çıkamıyordu. 250 sınamanın hiçbiri yakalamadı çünkü HİÇBİRİ paneli
   tarayıcıda açmıyordu: asama3 ve asama2-yetkili saf HTTP+DB, tarayıcı
   açan dukkan/sayfalama ise yalnızca vitrini geziyor.

   Hata sunucuda DEĞİLDİ — art arda iki DELETE isteği hep düzgün
   çalışıyordu. Hata React bileşeninin BELLEĞİNDEYDİ. O yüzden bu dosya
   API'yi değil EKRANI ölçüyor: düğme metni, disabled durumu, modalın
   açık/kapalı olması ve ağa çıkan istek sayısı.

   CANLI VERİTABANINA YAZIYOR. Kendi geçici hesabını ve kendi ürünlerini
   yaratıyor, hepsini finally içinde siliyor. Gerçek kataloğa dokunmuyor:
   sildiği ürünler yalnızca kendi yarattıklarıdır.
   ===================================================================== */

import { chromium } from "playwright-core";
import { randomBytes, randomInt, scrypt } from "node:crypto";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import { neon } from "@neondatabase/serverless";

nextEnv.loadEnvConfig(fileURLToPath(new URL("..", import.meta.url)), false);

const B = process.env.ADRES || "http://localhost:3001";
const CHROME = process.env.CHROME_YOLU || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const scryptAsync = promisify(scrypt);

let g = 0, k = 0;
const ok = (m) => { console.log(`  ✓ ${m}`); g++; };
const no = (m) => { console.log(`  ✗ ${m}`); k++; };
const bolum = (t) => console.log(`\n${"═".repeat(62)}\n${t}\n${"═".repeat(62)}`);

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL yok — .env.local yüklenemedi.");
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);

/* Sınamanın yarattığı her şey bu iki kalıba uyuyor; temizlik yalnızca
   bunlara bakıyor. "meydan" ve "zeynep" bu kalıplara UYMAZ. */
const URUN_ONEK = "SINAMA PANEL";
const HESAP_ONEK = "test_panel_";

async function hashle(parola) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(parola, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString("base64")}$${hash.toString("base64")}`;
}

function sifreUret() {
  const KUME = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let s = "";
  for (let i = 0; i < 20; i++) s += KUME[randomInt(0, KUME.length)];
  return s;
}

/** Sınamaya ait ürün ekler ve id'sini döner. */
async function urunEkle(etiket) {
  const [r] = await sql`
    INSERT INTO urunler (ad, reyon, fiyat, stokta, kaynak)
    VALUES (${`${URUN_ONEK} ${etiket}`}, 'kahvaltilik', 19.90, true, 'dukkan')
    RETURNING id`;
  return r.id;
}

let tarayici = null;
let geciciHesapId = null;

try {
  const kullaniciAdi = `${HESAP_ONEK}${Date.now()}`;
  const parola = sifreUret();
  const [hesap] = await sql`
    INSERT INTO yoneticiler (kullanici_adi, parola_hash, sifre_degistirmeli)
    VALUES (${kullaniciAdi}, ${await hashle(parola)}, false)
    RETURNING id`;
  geciciHesapId = hesap.id;

  tarayici = await chromium.launch({ executablePath: CHROME, headless: true });
  const baglam = await tarayici.newContext({ viewport: { width: 1280, height: 1000 } });
  const s = await baglam.newPage();
  s.setDefaultTimeout(30000);

  /* Panel uçlarına giden istekleri sayıyoruz. Bu hatanın imzası
     "ekran bir şey yapıyormuş gibi duruyor ama ağa hiçbir şey çıkmıyor"
     olduğu için sayaç ölçütün bir parçası. */
  const istekler = [];
  s.on("request", (r) => {
    if (r.url().includes("/api/yonetici/urun")) istekler.push(r.method());
  });
  const sayHer = (yontem) => istekler.filter((x) => x === yontem).length;

  const jsHatalari = [];
  s.on("pageerror", (e) => jsHatalari.push(e.message));

  /* ── ekran okuma yardımcıları ─────────────────────────────────── */

  /** Silme onay modalının o anki hâli. */
  const silmeDurumu = () => s.evaluate(() => {
    const d = [...document.querySelectorAll("dialog")]
      .find((x) => x.textContent.includes("Ürünü Silmek İstiyor"));
    if (!d) return { acik: false };
    const dugme = (re) => [...d.querySelectorAll("button")].find((b) => re.test(b.textContent));
    const onay = dugme(/Evet, Ürünü Sil|Siliniyor/);
    const vazgec = dugme(/Vazgeç/);
    return {
      acik: d.open,
      onayMetni: onay?.textContent.trim() ?? null,
      onayKilitli: onay?.disabled ?? null,
      vazgecKilitli: vazgec?.disabled ?? null,
      kapatVar: !!d.querySelector('button[aria-label="Kapat"]'),
      hataVar: !!d.querySelector('[role="alert"]'),
    };
  });

  /** Ekleme modalının o anki hâli. */
  const eklemeDurumu = () => s.evaluate(() => {
    const d = [...document.querySelectorAll("dialog")]
      .find((x) => x.open && x.textContent.includes("Yeni Ürün Ekle"));
    if (!d) return { acik: false };
    const gonder = d.querySelector('button[type="submit"]');
    return {
      acik: true,
      dugmeMetni: gonder?.textContent.trim() ?? null,
      dugmeKilitli: gonder?.disabled ?? null,
      hatalar: [...d.querySelectorAll("li")].map((x) => x.textContent.trim()),
    };
  });

  /** Düzenleme modalının o anki hâli. */
  const duzenlemeDurumu = () => s.evaluate(() => {
    const d = [...document.querySelectorAll("dialog")]
      .find((x) => x.open && /Kaydet|Kaydediliyor/.test(x.textContent));
    if (!d) return { acik: false };
    const kaydet = [...d.querySelectorAll("button")]
      .find((b) => /Kaydet|Kaydediliyor/.test(b.textContent));
    return {
      acik: true,
      dugmeMetni: kaydet?.textContent.trim() ?? null,
      dugmeKilitli: kaydet?.disabled ?? null,
    };
  });

  /** Arama kutusuyla süzüp ürün satırına tıklar → düzenleme modalı. */
  async function urunuAc(ad) {
    await s.fill('input[type="search"]', ad);
    await s.waitForTimeout(600);
    await s.locator(`text=${ad}`).first().click();
    await s.waitForTimeout(800);
  }

  /** Düzenleme modalından silme onayına geçer. */
  async function silmeyeGec() {
    await s.locator('dialog button:has-text("Sil")').first().click();
    await s.waitForTimeout(800);
  }

  /* ═══════ 1. Giriş ve panele varış ═══════ */
  bolum("1 — Giriş ve panele varış");
  await s.goto(`${B}/giris`, { waitUntil: "domcontentloaded" });
  await s.fill("#kullanici", kullaniciAdi);
  await s.fill('input[type="password"]', parola);
  await s.click('form button[type="submit"]');
  await s.waitForSelector("text=Yeni Ürün Ekle", { timeout: 30000 });
  await s.waitForTimeout(1200);
  ok("geçici hesapla giriş yapıldı, panel açıldı");
  (await s.locator('input[type="search"]').count()) === 1
    ? ok("arama kutusu var")
    : no("arama kutusu yok — sınama süzemez");

  /* ═══════ 2. ART ARDA İKİ SİLME — bu dosyanın varlık sebebi ═══════ */
  bolum("2 — Art arda İKİ silme (regresyon nöbetçisi)");
  {
    const a = await urunEkle("SIL A");
    const b = await urunEkle("SIL B");
    await s.reload({ waitUntil: "domcontentloaded" });
    await s.waitForSelector("text=Yeni Ürün Ekle");
    await s.waitForTimeout(1200);

    const oncekiDelete = sayHer("DELETE");

    await urunuAc(`${URUN_ONEK} SIL A`);
    await silmeyeGec();
    let d = await silmeDurumu();
    d.acik && d.onayMetni === "Evet, Ürünü Sil" && d.onayKilitli === false
      ? ok("1. silme: onay modalı hazır durumda açıldı")
      : no(`1. silme açılışı bozuk: ${JSON.stringify(d)}`);
    await s.locator('dialog button:has-text("Evet, Ürünü Sil")').click();
    await s.waitForTimeout(3000);
    d = await silmeDurumu();
    !d.acik ? ok("1. silme: modal kapandı") : no(`1. silme sonrası modal açık: ${JSON.stringify(d)}`);
    const kaldiA = await sql`SELECT id FROM urunler WHERE id = ${a}`;
    kaldiA.length === 0 ? ok("1. silme: ürün veritabanından gitti") : no("1. ürün duruyor");

    /* ── 2. SİLME: hatanın tam yeri ── */
    await urunuAc(`${URUN_ONEK} SIL B`);
    await silmeyeGec();
    d = await silmeDurumu();
    d.acik && d.onayMetni === "Evet, Ürünü Sil"
      ? ok('2. silme: düğme "Evet, Ürünü Sil" diyor (bayat "Siliniyor..." yok)')
      : no(`2. silme: düğme "${d.onayMetni}" — İLK SİLMEDEN KALAN KİLİT`);
    d.onayKilitli === false
      ? ok("2. silme: onay düğmesi tıklanabilir")
      : no("2. silme: onay düğmesi devre dışı — kilit taşınmış");
    d.vazgecKilitli === false
      ? ok("2. silme: Vazgeç etkin (kullanıcı kapana kısılmıyor)")
      : no("2. silme: Vazgeç devre dışı — kullanıcı mahsur");

    await s.locator('dialog button:has-text("Evet, Ürünü Sil")').click();
    await s.waitForTimeout(3000);
    d = await silmeDurumu();
    !d.acik ? ok("2. silme: modal kapandı") : no(`2. silme takıldı: ${JSON.stringify(d)}`);

    const kaldiB = await sql`SELECT id FROM urunler WHERE id = ${b}`;
    kaldiB.length === 0
      ? ok("2. silme: ürün GERÇEKTEN silindi")
      : no("2. ürün veritabanında duruyor — istek hiç gitmemiş");

    sayHer("DELETE") - oncekiDelete === 2
      ? ok("ağa tam 2 DELETE isteği çıktı")
      : no(`${sayHer("DELETE") - oncekiDelete} DELETE isteği çıktı, 2 bekleniyordu`);
  }

  /* ═══════ 3. Art arda İKİ ekleme ═══════ */
  bolum("3 — Art arda iki ekleme");
  {
    const oncekiPost = sayHer("POST");
    for (const tur of ["EKLE 1", "EKLE 2"]) {
      await s.click('button:has-text("Yeni Ürün Ekle")');
      await s.waitForTimeout(700);
      const d = await eklemeDurumu();
      d.acik && d.dugmeKilitli === false && d.hatalar.length === 0
        ? ok(`${tur}: modal temiz açıldı (bayat hata/kilit yok)`)
        : no(`${tur}: modal kirli açıldı — ${JSON.stringify(d)}`);
      await s.fill('dialog input[placeholder*="Ezine"]', `${URUN_ONEK} ${tur}`);
      await s.fill('dialog input[placeholder="0,00"]', "24,90");
      await s.locator("dialog select").first().selectOption({ index: 1 });
      await s.locator('dialog button[type="submit"]').click();
      await s.waitForTimeout(2500);
      (await eklemeDurumu()).acik === false
        ? ok(`${tur}: kaydedildi, modal kapandı`)
        : no(`${tur}: modal kapanmadı`);
    }
    sayHer("POST") - oncekiPost === 2
      ? ok("ağa tam 2 POST isteği çıktı")
      : no(`${sayHer("POST") - oncekiPost} POST isteği çıktı, 2 bekleniyordu`);
    const eklenen = await sql`
      SELECT id FROM urunler WHERE ad LIKE ${`${URUN_ONEK} EKLE%`}`;
    eklenen.length === 2 ? ok("iki ürün de veritabanında") : no(`${eklenen.length} ürün eklendi`);
  }

  /* ═══════ 4. Art arda İKİ düzenleme ═══════ */
  bolum("4 — Art arda iki düzenleme (aynı ürüne)");
  {
    for (const [tur, fiyat] of [["1.", "31,50"], ["2.", "32,50"]]) {
      await urunuAc(`${URUN_ONEK} EKLE 1`);
      const d = await duzenlemeDurumu();
      d.acik && d.dugmeKilitli === false
        ? ok(`${tur} düzenleme: modal hazır açıldı`)
        : no(`${tur} düzenleme: modal kilitli — ${JSON.stringify(d)}`);
      await s.locator('dialog input[inputmode="decimal"]').first().fill(fiyat);
      await s.locator("dialog button").filter({ hasText: /^Kaydet|Kaydediliyor/ }).first().click();
      await s.waitForTimeout(2500);
      (await duzenlemeDurumu()).acik === false
        ? ok(`${tur} düzenleme: kaydedildi, modal kapandı`)
        : no(`${tur} düzenleme: modal kapanmadı`);
      await s.keyboard.press("Escape").catch(() => {});
      await s.waitForTimeout(500);
    }
    const [son] = await sql`
      SELECT fiyat FROM urunler WHERE ad = ${`${URUN_ONEK} EKLE 1`}`;
    Number(son?.fiyat) === 32.5
      ? ok("ikinci düzenleme veritabanına işledi (₺32,50)")
      : no(`fiyat ₺${son?.fiyat}, ₺32,50 bekleniyordu`);
  }

  /* ═══════ 5. Art arda İKİ hızlı onay ═══════ */
  bolum("5 — Art arda iki hızlı onay");
  {
    await s.fill('input[type="search"]', URUN_ONEK);
    await s.waitForTimeout(700);
    const dugme = s.locator('button[aria-label^="Fiyatı onayla"]');
    const adet = await dugme.count();
    if (adet < 2) {
      no(`onay düğmesi ${adet} tane — iki farklı ürün gerekiyordu`);
    } else {
      const metin = async (i) => (await dugme.nth(i).textContent()).trim();
      await dugme.nth(0).click();
      await s.waitForTimeout(2000);
      (await metin(0)).includes("Onaylı")
        ? ok("1. hızlı onay işledi")
        : no(`1. onay sonrası düğme "${await metin(0)}"`);
      await dugme.nth(1).click();
      await s.waitForTimeout(2000);
      (await metin(1)).includes("Onaylı")
        ? ok("2. hızlı onay işledi (ilkinden kalan kilit yok)")
        : no(`2. onay sonrası düğme "${await metin(1)}"`);
    }
  }

  /* ═══════ 6. Modal kapanma yolları ═══════ */
  bolum("6 — Kapanma yolları: Vazgeç, Esc, ✕");
  {
    const kapanmaYolu = async (ad, kapat) => {
      await urunuAc(`${URUN_ONEK} EKLE 1`);
      await silmeyeGec();
      if (!(await silmeDurumu()).acik) { no(`${ad}: modal hiç açılmadı`); return; }
      await kapat();
      await s.waitForTimeout(900);
      (await silmeDurumu()).acik === false
        ? ok(`${ad} modalı kapatıyor`)
        : no(`${ad} modalı kapatmadı`);
      await s.keyboard.press("Escape").catch(() => {});
      await s.waitForTimeout(500);
    };

    await kapanmaYolu("Vazgeç düğmesi", () =>
      s.locator('dialog button:has-text("Vazgeç")').click());
    await kapanmaYolu("Esc tuşu", () => s.keyboard.press("Escape"));
    await kapanmaYolu("✕ düğmesi", () =>
      s.locator('dialog button[aria-label="Kapat"]').last().click());
  }

  /* ═══════ 7. Hata durumunda kilitlenme yok ═══════ */
  bolum("7 — İstek başarısız olunca modal kilitlenmiyor");
  {
    /* Ağı DELETE için kesiyoruz: istek hiç sunucuya varmıyor, fetch
       fırlatıyor. Düzeltmeden önce bu yol da bayrağı "true" bırakma
       riskini taşıyordu; artık finally sıfırlıyor. */
    await baglam.route("**/api/yonetici/urun", (yol) => {
      if (yol.request().method() === "DELETE") return yol.abort("failed");
      return yol.continue();
    });

    await urunuAc(`${URUN_ONEK} EKLE 1`);
    await silmeyeGec();
    await s.locator('dialog button:has-text("Evet, Ürünü Sil")').click();
    await s.waitForTimeout(3000);

    const d = await silmeDurumu();
    d.acik ? ok("ağ hatasında modal açık kalıyor (kullanıcı bilgileniyor)") : no("modal sessizce kapandı");
    d.onayMetni === "Evet, Ürünü Sil"
      ? ok('ağ hatasından sonra düğme "Evet, Ürünü Sil"e döndü')
      : no(`düğme "${d.onayMetni}" — kilit açılmamış`);
    d.onayKilitli === false ? ok("yeniden denenebilir") : no("düğme devre dışı kaldı");
    d.vazgecKilitli === false ? ok("Vazgeç hâlâ etkin") : no("Vazgeç kilitli");

    await baglam.unroute("**/api/yonetici/urun");
    await s.locator('dialog button:has-text("Vazgeç")').click();
    await s.waitForTimeout(700);

    const [hala] = await sql`
      SELECT id FROM urunler WHERE ad = ${`${URUN_ONEK} EKLE 1`}`;
    hala ? ok("başarısız silme ürüne dokunmadı") : no("ürün silinmiş — istek aslında gitmiş");
  }

  /* ═══════ 8. Oturum bitince ═══════ */
  bolum("8 — Oturum bitince davranış");
  {
    /* Oturumu sunucu tarafında iptal ediyoruz: çerez tarayıcıda duruyor
       ama karşılığı yok. Panelin bunu 401 olarak görüp kullanıcıya
       söylemesi gerekiyor — sessizce başarısız olmamalı. */
    await sql`DELETE FROM oturumlar WHERE yonetici_id = ${geciciHesapId}`;

    await urunuAc(`${URUN_ONEK} EKLE 2`);
    await silmeyeGec();
    await s.locator('dialog button:has-text("Evet, Ürünü Sil")').click();
    await s.waitForTimeout(3000);

    const uyari = await s.evaluate(() => {
      const el = [...document.querySelectorAll('[role="alert"]')]
        .find((x) => /Oturum/.test(x.textContent));
      return el ? el.textContent.trim().slice(0, 60) : null;
    });
    uyari
      ? ok(`oturum bitişi bildiriliyor: "${uyari}"`)
      : no("oturum bitince kullanıcıya hiçbir şey söylenmedi");

    const d = await silmeDurumu();
    d.acik === false || d.onayKilitli === false
      ? ok("oturum bitince de modal kilitli kalmıyor")
      : no("oturum bitişinden sonra modal kilitli");

    const [duruyor] = await sql`
      SELECT id FROM urunler WHERE ad = ${`${URUN_ONEK} EKLE 2`}`;
    duruyor ? ok("yetkisiz istek ürünü silmedi") : no("oturumsuz silme GERÇEKLEŞTİ");
  }

  jsHatalari.length === 0
    ? ok("panel boyunca JS hatası yok")
    : no(`${jsHatalari.length} JS hatası: ${jsHatalari[0]}`);

} finally {
  /* ═══════ Temizlik — HER DURUMDA ═══════ */
  if (tarayici) await tarayici.close().catch(() => {});

  const artikUrun = await sql`
    DELETE FROM urunler WHERE ad LIKE ${`${URUN_ONEK} %`} RETURNING id`;
  if (artikUrun.length) console.log(`\n  temizlik: ${artikUrun.length} sınama ürünü silindi`);

  if (geciciHesapId) {
    await sql`DELETE FROM oturumlar WHERE yonetici_id = ${geciciHesapId}`;
    await sql`DELETE FROM yoneticiler WHERE id = ${geciciHesapId}`;
  }
  const artikHesap = await sql`
    DELETE FROM yoneticiler WHERE kullanici_adi LIKE ${`${HESAP_ONEK}%`} RETURNING id`;
  if (artikHesap.length) console.log(`  temizlik: ${artikHesap.length} sınama hesabı silindi`);
}

console.log(`\n${"═".repeat(62)}`);
console.log(`PANEL SONUÇ: ${g} geçti, ${k} kaldı`);
console.log("═".repeat(62));
if (k > 0) process.exit(1);
