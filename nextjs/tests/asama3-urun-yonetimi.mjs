/* =====================================================================
   Aşama 3 — Ürün Yönetimi (Ekleme ve Silme) Otomatik Sınamaları
   tests/asama3-urun-yonetimi.mjs

   Çalıştırma: node --experimental-strip-types tests/asama3-urun-yonetimi.mjs
   ===================================================================== */

import { randomBytes, randomInt, scrypt } from "node:crypto";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import { neon } from "@neondatabase/serverless";

nextEnv.loadEnvConfig(fileURLToPath(new URL("..", import.meta.url)), false);

const B = process.env.ADRES || "http://localhost:3001";
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

async function sifreUret() {
  const KUME = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let s = "";
  for (let i = 0; i < 20; i++) s += KUME[randomInt(0, KUME.length)];
  return s;
}

async function hashle(parola) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(parola, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString("base64")}$${hash.toString("base64")}`;
}

let geciciYoneticiId = null;
let geciciKullaniciAdi = null;
let oturumCerezi = null;
let eklenenTestUrunId = null;

try {
  /* ═══════ 1. Yetkisiz Erişim Reddi ═══════ */
  bolum("1 — Yetkisiz İsteklerin Reddi (401)");
  {
    const resPost = await fetch(`${B}/api/yonetici/urun`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ad: "Yetkisiz Ürün", reyon: "sut", fiyat: 25 }),
    });
    resPost.status === 401 ? ok("POST /api/yonetici/urun oturumsuz 401") : no(`POST beklenen 401, gelen: ${resPost.status}`);

    const resDel = await fetch(`${B}/api/yonetici/urun`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "u001" }),
    });
    resDel.status === 401 ? ok("DELETE /api/yonetici/urun oturumsuz 401") : no(`DELETE beklenen 401, gelen: ${resDel.status}`);
  }

  /* ═══════ 2. Geçici Yönetici ve Oturum Açma ═══════ */
  bolum("2 — Geçici Yönetici Hesabı ve Giriş");
  {
    geciciKullaniciAdi = `test_yonetici_${Date.now()}`;
    const parola = await sifreUret();
    const parolaHash = await hashle(parola);

    const ekle = await sql`
      INSERT INTO yoneticiler (kullanici_adi, parola_hash)
      VALUES (${geciciKullaniciAdi}, ${parolaHash})
      RETURNING id
    `;
    geciciYoneticiId = ekle[0].id;

    const girisRes = await fetch(`${B}/api/giris`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kullaniciAdi: geciciKullaniciAdi, parola }),
    });

    girisRes.status === 200 ? ok("Geçici yönetici girişi 200 OK") : no(`Giriş başarısız: ${girisRes.status}`);
    const setCookie = girisRes.headers.get("set-cookie") ?? "";
    const eslesme = /oturum=([^;]+)/.exec(setCookie);
    oturumCerezi = eslesme ? `oturum=${eslesme[1]}` : null;
    oturumCerezi ? ok("Oturum çerezi alındı") : no("Çerez alınamadı");
  }

  /* ═══════ 3. Form ve Veri Doğrulama (400) ═══════ */
  bolum("3 — Ürün Ekleme Giriş Doğrulamaları");
  {
    const authHeaders = {
      "Content-Type": "application/json",
      Cookie: oturumCerezi,
    };

    // Boş isim
    const r1 = await fetch(`${B}/api/yonetici/urun`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ ad: "", reyon: "sut", fiyat: 50 }),
    });
    r1.status === 400 ? ok("Boş isim 400 ile reddedildi") : no(`r1 status: ${r1.status}`);

    // Negatif / sıfır fiyat
    const r2 = await fetch(`${B}/api/yonetici/urun`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ ad: "Test Ürün", reyon: "sut", fiyat: -10 }),
    });
    r2.status === 400 ? ok("Negatif fiyat 400 ile reddedildi") : no(`r2 status: ${r2.status}`);

    // Geçersiz reyon
    const r3 = await fetch(`${B}/api/yonetici/urun`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ ad: "Test Ürün", reyon: "olmayan_reyon_xyz", fiyat: 50 }),
    });
    r3.status === 400 ? ok("Geçersiz reyon 400 ile reddedildi") : no(`r3 status: ${r3.status}`);

    // Miktar var, birim yok
    const r4 = await fetch(`${B}/api/yonetici/urun`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ ad: "Test Ürün", reyon: "sut", fiyat: 50, miktar: 500 }),
    });
    r4.status === 400 ? ok("Miktar var birim yok 400 ile reddedildi") : no(`r4 status: ${r4.status}`);

    // Eski fiyat güncel fiyattan küçük
    const r5 = await fetch(`${B}/api/yonetici/urun`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ ad: "Test Ürün", reyon: "sut", fiyat: 50, eskiFiyat: 40 }),
    });
    r5.status === 400 ? ok("Eski fiyat < güncel fiyat 400 ile reddedildi") : no(`r5 status: ${r5.status}`);
  }

  /* ═══════ 4. Başarılı Ürün Ekleme (POST 201) ═══════ */
  bolum("4 — Başarılı Ürün Ekleme");
  {
    const authHeaders = {
      "Content-Type": "application/json",
      Cookie: oturumCerezi,
    };

    const urunGirdisi = {
      ad: "Meydan Özel Ezine Peyniri 500 G",
      reyon: "kahvaltilik",
      fiyat: 185.5,
      eskiFiyat: 210.0,
      miktar: 0.5,
      birim: "kg",
      stokta: true,
      gorsel: "https://images.migrosone.com/test.jpg",
    };

    const res = await fetch(`${B}/api/yonetici/urun`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(urunGirdisi),
    });

    res.status === 201 ? ok("POST /api/yonetici/urun 201 Created") : no(`POST status: ${res.status}`);
    const veri = await res.json();
    veri.eklendi === true ? ok("eklendi: true döndü") : no("eklendi alanı false veya yok");
    
    eklenenTestUrunId = veri.urun?.id;
    typeof eklenenTestUrunId === "string" && eklenenTestUrunId.startsWith("u")
      ? ok(`Otomatik üretilen kimlik geçerli: ${eklenenTestUrunId}`)
      : no(`Geçersiz id: ${eklenenTestUrunId}`);

    veri.urun?.ad === urunGirdisi.ad ? ok("Ürün adı doğru") : no("Ürün adı uyuşmuyor");
    veri.urun?.fiyat === urunGirdisi.fiyat ? ok("Fiyat doğru") : no("Fiyat uyuşmuyor");
    veri.urun?.eskiFiyat === urunGirdisi.eskiFiyat ? ok("Eski fiyat doğru") : no("Eski fiyat uyuşmuyor");
    veri.urun?.kaynak === "dukkan" ? ok("Kaynak 'dukkan' olarak atandı") : no("Kaynak dukkan değil");

    // Veritabanından doğrudan doğrulama
    const dbKontrol = await sql`SELECT * FROM urunler WHERE id = ${eklenenTestUrunId}`;
    dbKontrol.length === 1 ? ok("Veritabanında 1 kayıt bulundu") : no("Veritabanında kayıt bulunamadı");
  }

  /* ═══════ 5. Başarılı Ürün Silme (DELETE 200) ═══════ */
  bolum("5 — Başarılı Ürün Silme");
  {
    const authHeaders = {
      "Content-Type": "application/json",
      Cookie: oturumCerezi,
    };

    // Var olmayan id silme
    const rYok = await fetch(`${B}/api/yonetici/urun`, {
      method: "DELETE",
      headers: authHeaders,
      body: JSON.stringify({ id: "u999999_olmayan" }),
    });
    rYok.status === 404 ? ok("Var olmayan ürün silinirken 404 döndü") : no(`rYok status: ${rYok.status}`);

    // Eklenen test ürününü silme
    const res = await fetch(`${B}/api/yonetici/urun`, {
      method: "DELETE",
      headers: authHeaders,
      body: JSON.stringify({ id: eklenenTestUrunId }),
    });

    res.status === 200 ? ok("DELETE /api/yonetici/urun 200 OK") : no(`DELETE status: ${res.status}`);
    const veri = await res.json();
    veri.silindi === true && veri.id === eklenenTestUrunId
      ? ok(`Ürün başarıyla silindi: id=${veri.id}`)
      : no("silindi yanıtı geçersiz");

    // Veritabanında kalmadığını doğrula
    const dbKontrol = await sql`SELECT * FROM urunler WHERE id = ${eklenenTestUrunId}`;
    dbKontrol.length === 0 ? ok("Veritabanından tamamen silindiği doğrulandı") : no("Kayıt veritabanında hâlâ duruyor");
    eklenenTestUrunId = null;
  }
} finally {
  /* ═══════ 6. DELETE ucunun kapıları (J1) ═══════ */
  bolum("6 — DELETE kapıları: Content-Type ve id kaynağı");
  {
    /* GERİLEME NÖBETİ. DELETE, PATCH/POST'un aksine Content-Type kapısından
       geçmiyordu ve id'yi sorgu dizesinden de kabul ediyordu: en yıkıcı uç
       en zayıf korunanıydı. Gövdesiz bir istek bile silebiliyordu. */
    const [{ id: kurban }] = await sql`
      INSERT INTO urunler (ad, reyon, fiyat, kaynak)
      VALUES ('SINAMA J1 silinecek', 'kahvaltilik', 12.34, 'dukkan')
      RETURNING id`;

    const duzMetin = await fetch(`${B}/api/yonetici/urun`, {
      method: "DELETE",
      headers: { "Content-Type": "text/plain", Cookie: oturumCerezi },
      body: JSON.stringify({ id: kurban }),
    });
    duzMetin.status === 415
      ? ok("text/plain gövdeyle DELETE 415 ile reddediliyor")
      : no(`text/plain → ${duzMetin.status}, 415 bekleniyordu`);

    const sorguDizesi = await fetch(`${B}/api/yonetici/urun?id=${kurban}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Cookie: oturumCerezi },
    });
    sorguDizesi.status === 400
      ? ok("?id= ile silme artık çalışmıyor (400) — id yalnızca gövdeden")
      : no(`?id= → ${sorguDizesi.status}, 400 bekleniyordu`);

    const hala = await sql`SELECT id FROM urunler WHERE id = ${kurban}`;
    hala.length === 1
      ? ok("reddedilen iki istekten sonra ürün HÂLÂ duruyor")
      : no("ürün silinmiş — kapılar sızdırıyor");

    const cerezsiz = await fetch(`${B}/api/yonetici/urun`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: kurban }),
    });
    cerezsiz.status === 401
      ? ok("çerezsiz DELETE 401")
      : no(`çerezsiz → ${cerezsiz.status}`);

    const gecerli = await fetch(`${B}/api/yonetici/urun`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Cookie: oturumCerezi },
      body: JSON.stringify({ id: kurban }),
    });
    gecerli.status === 200
      ? ok("gövdeyle geçerli DELETE 200")
      : no(`gövdeyle → ${gecerli.status}`);

    const gitti = await sql`SELECT id FROM urunler WHERE id = ${kurban}`;
    gitti.length === 0 ? ok("ürün gerçekten silindi") : no("ürün duruyor");
  }

  /* ═══════ 7. Fiyat geçmişi sayımı (J2) ═══════ */
  bolum("7 — Silme onayı için fiyat geçmişi sayısı");
  {
    const [{ id: gecmisli }] = await sql`
      INSERT INTO urunler (ad, reyon, fiyat, kaynak)
      VALUES ('SINAMA J2 gecmisli', 'kahvaltilik', 10.00, 'dukkan')
      RETURNING id`;
    // üç fiyat değişikliği → trigger üç kayıt atmalı
    for (const f of [11, 12, 13]) {
      await sql`UPDATE urunler SET fiyat = ${f} WHERE id = ${gecmisli}`;
    }

    const liste = await (await fetch(`${B}/api/yonetici/urunler`, {
      headers: { Cookie: oturumCerezi }, cache: "no-store",
    })).json();
    const kayit = liste.urunler.find((u) => u.id === gecmisli);
    kayit?.fiyatGecmisiSayisi === 3
      ? ok("panel listesi fiyatGecmisiSayisi=3 bildiriyor")
      : no(`fiyatGecmisiSayisi: ${kayit?.fiyatGecmisiSayisi}, 3 bekleniyordu`);

    // İPTAL benzetimi: silme isteği HİÇ gönderilmezse kayıt durmalı
    const iptalSonrasi = await sql`SELECT id FROM urunler WHERE id = ${gecmisli}`;
    const gecmisDuruyor = await sql`SELECT count(*)::int c FROM fiyat_gecmisi WHERE urun_id = ${gecmisli}`;
    iptalSonrasi.length === 1 && gecmisDuruyor[0].c === 3
      ? ok("iptal edilince ürün ve 3 geçmiş kaydı yerinde duruyor")
      : no("iptal sonrası veri bozulmuş");

    const sil = await fetch(`${B}/api/yonetici/urun`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Cookie: oturumCerezi },
      body: JSON.stringify({ id: gecmisli }),
    });
    const silVeri = await sil.json();
    silVeri.silinenFiyatGecmisi === 3
      ? ok("DELETE yanıtı silinenFiyatGecmisi=3 bildiriyor")
      : no(`silinenFiyatGecmisi: ${silVeri.silinenFiyatGecmisi}`);

    const kalanGecmis = await sql`SELECT count(*)::int c FROM fiyat_gecmisi WHERE urun_id = ${gecmisli}`;
    kalanGecmis[0].c === 0
      ? ok("CASCADE ile fiyat geçmişi de silindi")
      : no(`${kalanGecmis[0].c} yetim kayıt kaldı`);
  }

  /* ═══════ 8. PWA ikonları (J4) ═══════ */
  bolum("8 — PWA ikonları manifestle uyuşuyor mu");
  {
    const man = await (await fetch(`${B}/manifest.json`)).json();
    for (const ikon of man.icons) {
      const y = await fetch(B + ikon.src);
      const buf = Buffer.from(await y.arrayBuffer());
      // PNG imzası: 89 50 4E 47
      const png = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
      // IHDR: 16..24 arası genişlik/yükseklik
      const en = buf.readUInt32BE(16), boy = buf.readUInt32BE(20);
      const [bekEn, bekBoy] = ikon.sizes.split("x").map(Number);
      png ? ok(`${ikon.src} gerçekten PNG`) : no(`${ikon.src} PNG DEĞİL`);
      en === bekEn && boy === bekBoy
        ? ok(`${ikon.src} ${en}x${boy} — manifestteki ${ikon.sizes} ile aynı`)
        : no(`${ikon.src} ${en}x${boy}, manifest ${ikon.sizes} diyor`);
    }
  }

  /* ═══════ Temizlik ═══════ */
  if (eklenenTestUrunId) {
    await sql`DELETE FROM urunler WHERE id = ${eklenenTestUrunId}`;
  }
  if (geciciYoneticiId) {
    await sql`DELETE FROM yoneticiler WHERE id = ${geciciYoneticiId}`;
  }
}

console.log(`\n${"═".repeat(62)}`);
console.log(`AŞAMA 3 (ÜRÜN YÖNETİMİ) SONUÇ: ${g} geçti, ${k} kaldı`);
if (k > 0) process.exit(1);
