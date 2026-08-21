/* =====================================================================
   Aşama 2 — YETKİLİ taraf sınamaları.

   asama2.mjs yalnızca kapıyı dışarıdan yokluyor: oturumsuz istek 401 mi.
   Bu dosya kapıdan GİRİP içeride ne olduğuna bakıyor — doğrulama gerçekten
   çalışıyor mu, kaynak damgası doğru anda mı değişiyor, fiyat geçmişi
   tetikleniyor mu, çıkıştan sonra çerez gerçekten ölüyor mu.

   CANLI VERİTABANINA YAZIYOR. Güvenlik ağı, kökteki
   scripts/deneme-yedegi.js ile aynı desende:

     1. urunler tablosunun yazılabilir alanlarının kopyası alınır
     2. sınamalar çalışır
     3. finally içinde kopya geri yüklenir
     4. geri yüklemenin BİREBİR olduğu satır satır doğrulanır

   Hesap: geçici bir yönetici açılır (scripts/yonetici-ekle.js --gecici ile
   aynı mantık: kriptografik rastgele 20 karakter, karışan harfler yok) ve
   sonunda SİLİNİR. 'meydan' hesabına dokunulmaz.

   IP: hız sınırı sınaması gerçek başarısız denemeler üretiyor. Her senaryo
   kendi sahte IP'siyle çalışıyor (203.0.113.0/24 — RFC 5737 belgeleme
   bloğu, gerçek trafiğe ait olamaz) ki senaryolar birbirinin hız sınırını
   tetiklemesin ve temizlik tek desenle yapılabilsin.
   ===================================================================== */

import { randomBytes, randomInt, scrypt } from "node:crypto";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import { neon } from "@neondatabase/serverless";

// Betik Next dışında çalışıyor: .env.local'i Next'in kendi yükleyicisiyle
// alıyoruz ki dosya önceliği derlemedekiyle aynı olsun.
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

/* ═══════ yardımcılar ═══════ */

const ALANLAR = ["fiyat", "eski_fiyat", "miktar", "birim", "stokta", "kaynak", "guncellendi"];
const IP_ONEK = "203.0.113.";

/* Karşılaştırma için tek biçim — deneme-yedegi.js'teki duz() ile aynı
   gerekçe: sürücü numeric'i metin, timestamptz'i Date döndürüyor. */
const duz = (v) => {
  if (v === null || v === undefined) return "null";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string" && /^\d{4}-\d\d-\d\dT/.test(v)) return new Date(v).toISOString();
  if (typeof v === "number" || /^-?\d+(\.\d+)?$/.test(String(v))) return String(Number(v));
  return String(v);
};

const parmak = (satirlar) =>
  satirlar.map((u) => [u.id, ...ALANLAR.map((a) => duz(u[a]))].join("|")).join("\n");

async function urunleriOku() {
  return sql`SELECT id, fiyat, eski_fiyat, miktar, birim, stokta, kaynak, guncellendi
               FROM urunler ORDER BY id`;
}

/** scripts/yonetici-ekle.js --gecici ile aynı alfabe ve uzunluk. */
const ALFABE = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
function geciciSifreUret() {
  let s = "";
  for (let i = 0; i < 20; i++) s += ALFABE[randomInt(ALFABE.length)];
  return s;
}

/** lib/auth.ts'teki parolaHashle ile aynı biçim: scrypt$N$r$p$salt$hash */
async function parolaHashle(parola) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(parola, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 256 * 1024 * 1024 });
  return ["scrypt", 16384, 8, 1, salt.toString("base64"), hash.toString("base64")].join("$");
}

/** Çerez yönetimi elle: Node fetch'i çerez saklamıyor. */
function cerezAyikla(yanit) {
  const ham = yanit.headers.getSetCookie?.() ?? [];
  for (const c of ham) {
    const [ciftler] = c.split(";");
    const esit = ciftler.indexOf("=");
    if (ciftler.slice(0, esit).trim() === "oturum") return ciftler.slice(esit + 1).trim();
  }
  return null;
}

const istek = (yol, { metod = "GET", govde, cerez, ip, tur = "application/json" } = {}) =>
  fetch(B + yol, {
    method: metod,
    headers: {
      ...(tur ? { "content-type": tur } : {}),
      ...(cerez ? { cookie: `oturum=${cerez}` } : {}),
      ...(ip ? { "x-forwarded-for": ip } : {}),
    },
    body: govde === undefined ? undefined : JSON.stringify(govde),
  });

/* ═══════ ana akış ═══════ */

const kullaniciAdi = `sinama_gecici_${randomBytes(4).toString("hex")}`;
const parola = geciciSifreUret();

let kopya = null;
let fiyatGecmisiTaban = 0;
let hesapAcildi = false;
/** Sınama başlarken ölçülen durum — sonda buna dönülmüş olmalı. */
let taban = null;

try {
  bolum("0 — Hazırlık: kopya, geçici hesap");

  kopya = await urunleriOku();
  kopya.length === 470
    ? ok(`urunler kopyası alındı (${kopya.length} ürün, ${ALANLAR.length} alan)`)
    : no(`kopya ${kopya.length} ürün içeriyor, 470 bekleniyordu — SINAMA DURUYOR`);
  if (kopya.length !== 470) throw new Error("kopya beklenen boyutta değil");

  const kopyaParmak = parmak(kopya);

  const [{ enSon }] = await sql`SELECT COALESCE(max(id), 0)::int AS "enSon" FROM fiyat_gecmisi`;
  fiyatGecmisiTaban = enSon;

  /* Son durum denetimi SABİT sayılara değil, sınama BAŞLARKEN ölçülen
     tabana bakıyor. Sabit sayılar (470 / 0 / 0 / 88 / yalnız "meydan")
     yanlış bir şey ölçüyordu: esnaf gerçekten bir fiyatı onaylayınca ya da
     yeni bir yönetici hesabı açılınca sınama, kendi kirletmediği bir
     değişiklik yüzünden kırmızıya dönüyordu. Sorulması gereken soru
     "veritabanı şu sabit hâlde mi" değil, "SINAMA hiçbir iz bıraktı mı". */
  const [[tu], [td], [tm], ty] = await Promise.all([
    sql`SELECT count(*)::int c FROM urunler`,
    sql`SELECT count(*)::int c FROM urunler WHERE kaynak = 'dukkan'`,
    sql`SELECT count(*)::int c FROM urunler WHERE miktar IS NULL`,
    sql`SELECT kullanici_adi FROM yoneticiler ORDER BY id`,
  ]);
  taban = {
    urun: tu.c,
    dukkan: td.c,
    miktarNull: tm.c,
    fiyatGecmisi: enSon,
    hesaplar: ty.map((r) => r.kullanici_adi).sort(),
  };
  ok(`taban ölçüldü: ${taban.urun} ürün, kaynak='dukkan' ${taban.dukkan}, ` +
     `miktar IS NULL ${taban.miktarNull}, hesap: ${taban.hesaplar.join(", ")}`);

  await sql`INSERT INTO yoneticiler (kullanici_adi, parola_hash, sifre_degistirmeli)
            VALUES (${kullaniciAdi}, ${await parolaHashle(parola)}, false)`;
  hesapAcildi = true;
  ok(`geçici hesap açıldı (${kullaniciAdi}) — sonunda silinecek`);

  /* ═══════ 1. Giriş ═══════ */
  bolum("1 — Gerçek oturum açma");

  const girisYanit = await istek("/api/giris", {
    metod: "POST", govde: { kullaniciAdi, parola }, ip: IP_ONEK + "10",
  });
  const girisVeri = await girisYanit.json();
  girisYanit.status === 200 && girisVeri.girisli === true
    ? ok("POST /api/giris doğru bilgiyle 200 ve girisli:true")
    : no(`giriş başarısız: ${girisYanit.status} ${JSON.stringify(girisVeri)}`);

  const cerez = cerezAyikla(girisYanit);
  cerez ? ok("oturum çerezi Set-Cookie ile geldi") : no("Set-Cookie'de oturum çerezi yok");
  if (!cerez) throw new Error("çerez alınamadı, yetkili sınamalar yapılamaz");

  const ham = girisYanit.headers.getSetCookie().find((c) => c.startsWith("oturum="));
  /^.*HttpOnly/i.test(ham) ? ok("çerez HttpOnly") : no("HttpOnly yok");
  /SameSite=Lax/i.test(ham) ? ok("çerez SameSite=Lax") : no("SameSite=Lax yok");

  const durumYanit = await istek("/api/yonetici/durum", { cerez, ip: IP_ONEK + "10" });
  const durumVeri = await durumYanit.json();
  durumYanit.status === 200 && durumVeri.kullaniciAdi === kullaniciAdi
    ? ok(`korumalı uç oturumla 200 (urunSayisi: ${durumVeri.urunSayisi})`)
    : no(`korumalı uç ${durumYanit.status}: ${JSON.stringify(durumVeri)}`);

  /* ═══════ 2. Geçersiz yamalar ═══════ */
  bolum("2 — Geçerli oturumla GEÇERSİZ yama → 400");

  const hedef = kopya.find((u) => u.birim === null) ?? kopya[0];
  const hedefBirimli = kopya.find((u) => u.birim !== null) ?? kopya[0];

  const gecersizler = [
    ["fiyat -5 (negatif)", { id: hedef.id, fiyat: -5 }, "sıfırdan büyük"],
    ["fiyat 3 ondalık", { id: hedef.id, fiyat: 12.345 }, "ondalık"],
    ["eskiFiyat < fiyat", { id: hedef.id, fiyat: 100, eskiFiyat: 50 }, "büyük olmalı"],
    ["birim 'gram'", { id: hedef.id, miktar: 500, birim: "gram" }, "kg, L, adet"],
    ["miktar dolu, birim null", { id: hedef.id, miktar: 5, birim: null }, "birlikte"],
    ["birim adet + miktar 2.5", { id: hedef.id, miktar: 2.5, birim: "adet" }, "tam sayı"],
    ['stokta "true" dizgisi', { id: hedef.id, stokta: "true" }, "true ya da false"],
    ["tanınmayan alan (ad)", { id: hedef.id, ad: "Yeni Ad" }, "düzenlenemez"],
  ];

  for (const [baslik, govde, beklenenParca] of gecersizler) {
    const y = await istek("/api/yonetici/urun", { metod: "PATCH", govde, cerez, ip: IP_ONEK + "10" });
    const v = await y.json();
    const metin = JSON.stringify(v);
    y.status === 400 && metin.includes(beklenenParca)
      ? ok(`${baslik} → 400 ("${beklenenParca}" geçiyor)`)
      : no(`${baslik} → ${y.status} ${metin}`);
  }

  const cokluYanit = await istek("/api/yonetici/urun", {
    metod: "PATCH", cerez, ip: IP_ONEK + "10",
    govde: { id: hedef.id, fiyat: -5, birim: "gram", stokta: "evet", ad: "X" },
  });
  const cokluVeri = await cokluYanit.json();
  cokluYanit.status === 400 && Array.isArray(cokluVeri.hatalar) && cokluVeri.hatalar.length >= 4
    ? ok(`birden çok geçersiz alan tek yanıtta toplanıyor (${cokluVeri.hatalar.length} hata)`)
    : no(`çoklu hata beklendi: ${cokluYanit.status} ${JSON.stringify(cokluVeri)}`);

  const degismedi = await sql`SELECT fiyat, birim, stokta, kaynak FROM urunler WHERE id = ${hedef.id}`;
  duz(degismedi[0].fiyat) === duz(hedef.fiyat) && degismedi[0].kaynak === hedef.kaynak
    ? ok("geçersiz yamalardan sonra ürün veritabanında DEĞİŞMEMİŞ")
    : no("geçersiz yama satırı değiştirmiş");

  /* ═══════ 3. Geçerli fiyat değişikliği ═══════ */
  bolum("3 — Geçerli fiyat değişikliği → 200, kaynak ve fiyat geçmişi");

  const yeniFiyat = Number((Number(hedef.fiyat) + 1.25).toFixed(2));
  const fy = await istek("/api/yonetici/urun", {
    metod: "PATCH", govde: { id: hedef.id, fiyat: yeniFiyat }, cerez, ip: IP_ONEK + "10",
  });
  const fv = await fy.json();
  fy.status === 200 && fv.guncellendi === true
    ? ok(`fiyat ${hedef.fiyat} → ${yeniFiyat} kabul edildi (200)`)
    : no(`fiyat değişikliği ${fy.status}: ${JSON.stringify(fv)}`);

  fv.degisenAlanlar?.includes("fiyat")
    ? ok("yanıt degisenAlanlar içinde fiyat bildiriyor")
    : no(`degisenAlanlar: ${JSON.stringify(fv.degisenAlanlar)}`);

  const [sonra] = await sql`SELECT fiyat, kaynak FROM urunler WHERE id = ${hedef.id}`;
  duz(sonra.fiyat) === duz(yeniFiyat)
    ? ok("yeni fiyat veritabanına yazıldı")
    : no(`veritabanındaki fiyat ${sonra.fiyat}, beklenen ${yeniFiyat}`);
  sonra.kaynak === "dukkan"
    ? ok(`kaynak 'dukkan' oldu (önce: ${hedef.kaynak ?? "null"})`)
    : no(`kaynak '${sonra.kaynak}', 'dukkan' bekleniyordu`);

  const gecmis = await sql`SELECT urun_id, eski, yeni FROM fiyat_gecmisi
                            WHERE id > ${fiyatGecmisiTaban} AND urun_id = ${hedef.id}`;
  gecmis.length === 1 && duz(gecmis[0].yeni) === duz(yeniFiyat)
    ? ok("fiyat_gecmisi'ne trigger kaydı düştü (eski → yeni)")
    : no(`fiyat_gecmisi kaydı beklendi, bulunan: ${JSON.stringify(gecmis)}`);

  /* ═══════ 4. Yalnızca stokta ═══════ */
  bolum("4 — Yalnızca stokta değişikliği → kaynak DEĞİŞMEMELİ");

  const stokHedef = hedefBirimli;
  const oncekiKaynak = stokHedef.kaynak;
  const sy = await istek("/api/yonetici/urun", {
    metod: "PATCH", govde: { id: stokHedef.id, stokta: !stokHedef.stokta }, cerez, ip: IP_ONEK + "10",
  });
  sy.status === 200 ? ok("stokta değişikliği 200") : no(`stokta değişikliği ${sy.status}`);

  const [stokSonra] = await sql`SELECT stokta, kaynak FROM urunler WHERE id = ${stokHedef.id}`;
  stokSonra.stokta === !stokHedef.stokta
    ? ok("stokta alanı gerçekten değişti")
    : no("stokta değişmemiş");
  duz(stokSonra.kaynak) === duz(oncekiKaynak)
    ? ok(`kaynak DEĞİŞMEDİ ('${oncekiKaynak ?? "null"}') — stok işaretlemek fiyat doğrulamak değil`)
    : no(`kaynak '${oncekiKaynak}' → '${stokSonra.kaynak}' olmuş, değişmemeliydi`);

  /* ═══════ 5. Fiyat aykırılığı uyarısı ═══════ */
  bolum("5 — 100 kat fiyat → 200 + uyarı");

  const ucuncu = kopya.find((u) => u.id !== hedef.id && u.id !== stokHedef.id);
  const katliFiyat = Number((Number(ucuncu.fiyat) * 100).toFixed(2));
  const uy = await istek("/api/yonetici/urun", {
    metod: "PATCH", govde: { id: ucuncu.id, fiyat: katliFiyat }, cerez, ip: IP_ONEK + "10",
  });
  const uv = await uy.json();
  uy.status === 200
    ? ok(`100 kat fiyat KABUL edildi (200) — uyarı kaydı engellemiyor`)
    : no(`100 kat fiyat ${uy.status}: ${JSON.stringify(uv)}`);
  Array.isArray(uv.uyarilar) && uv.uyarilar.length > 0
    ? ok(`uyarilar alanı dolu: "${uv.uyarilar[0].slice(0, 60)}…"`)
    : no(`uyarilar boş: ${JSON.stringify(uv.uyarilar)}`);

  /* ═══════ 6. Çıkış ═══════ */
  bolum("6 — Çıkış → aynı çerez artık geçersiz");

  const cikisYanit = await istek("/api/cikis", { metod: "POST", cerez, ip: IP_ONEK + "10" });
  cikisYanit.status === 200 ? ok("POST /api/cikis 200") : no(`çıkış ${cikisYanit.status}`);

  const oturumSonra = await istek("/api/oturum", { cerez, ip: IP_ONEK + "10" });
  const oturumVeri = await oturumSonra.json();
  oturumVeri.girisli === false
    ? ok("GET /api/oturum aynı çerezle girisli:false")
    : no(`oturum hâlâ açık: ${JSON.stringify(oturumVeri)}`);

  const olu = await istek("/api/yonetici/durum", { cerez, ip: IP_ONEK + "10" });
  olu.status === 401
    ? ok("korumalı uç ölü çerezle 401 — oturum veritabanından silinmiş")
    : no(`ölü çerezle ${olu.status} döndü, 401 bekleniyordu`);

  const yazma = await istek("/api/yonetici/urun", {
    metod: "PATCH", govde: { id: hedef.id, fiyat: 9.99 }, cerez, ip: IP_ONEK + "10",
  });
  yazma.status === 401
    ? ok("yazma ucu ölü çerezle 401")
    : no(`yazma ucu ölü çerezle ${yazma.status}`);

  /* ═══════ 7. Hız sınırı ═══════ */
  bolum("7 — Hız sınırı: 6. yanlış denemede 429");

  const hizIp = IP_ONEK + "77";
  const kodlar = [];
  for (let i = 1; i <= 6; i++) {
    const y = await istek("/api/giris", {
      metod: "POST", ip: hizIp,
      govde: { kullaniciAdi, parola: "kesinlikle-yanlis-parola" },
    });
    kodlar.push(y.status);
  }
  kodlar.slice(0, 5).every((c) => c === 401)
    ? ok(`ilk 5 yanlış deneme 401 (${kodlar.slice(0, 5).join(",")})`)
    : no(`ilk 5 deneme: ${kodlar.slice(0, 5).join(",")}`);
  kodlar[5] === 429
    ? ok("6. deneme 429 — hız sınırı devrede")
    : no(`6. deneme ${kodlar[5]}, 429 bekleniyordu`);

  const dogruAmaSinirli = await istek("/api/giris", {
    metod: "POST", govde: { kullaniciAdi, parola }, ip: hizIp,
  });
  dogruAmaSinirli.status === 429
    ? ok("sınıra takılan IP'de DOĞRU parola bile 429 — parolaya bakılmadan kesiliyor")
    : no(`doğru parolayla ${dogruAmaSinirli.status}, 429 bekleniyordu`);

  /* ═══════ 8. Geri yükleme ═══════ */
  bolum("8 — Veritabanını sınama öncesine döndür");

  const idler = kopya.map((u) => u.id);
  await sql`
    UPDATE urunler AS u
       SET fiyat = k.fiyat, eski_fiyat = k.eski_fiyat, miktar = k.miktar,
           birim = k.birim, stokta = k.stokta, kaynak = k.kaynak,
           guncellendi = k.guncellendi
      FROM (
        SELECT * FROM unnest(
          ${idler}::text[],
          ${kopya.map((u) => u.fiyat)}::numeric[],
          ${kopya.map((u) => u.eski_fiyat)}::numeric[],
          ${kopya.map((u) => u.miktar)}::numeric[],
          ${kopya.map((u) => u.birim)}::text[],
          ${kopya.map((u) => u.stokta)}::boolean[],
          ${kopya.map((u) => u.kaynak)}::text[],
          ${kopya.map((u) => duz(u.guncellendi))}::timestamptz[]
        ) AS t(id, fiyat, eski_fiyat, miktar, birim, stokta, kaynak, guncellendi)
      ) AS k
     WHERE u.id = k.id
  `;
  ok("urunler geri yüklendi");

  /* İKİNCİ GEÇİŞ — guncellendi damgası.
     Trigger BEFORE UPDATE OF fiyat: fiyat eski değerine geri döndüğünde de
     "değişti" sayıyor ve NEW.guncellendi := now() yazıyor, yani yukarıdaki
     UPDATE'te geri koyduğumuz damgayı eziyor. Trigger yalnızca fiyat
     sütunu güncellenirken tetiklendiği için, damgayı tek başına yazan
     ikinci bir UPDATE onu uyandırmıyor. */
  await sql`
    UPDATE urunler AS u
       SET guncellendi = k.guncellendi
      FROM (
        SELECT * FROM unnest(
          ${idler}::text[],
          ${kopya.map((u) => duz(u.guncellendi))}::timestamptz[]
        ) AS t(id, guncellendi)
      ) AS k
     WHERE u.id = k.id
  `;
  ok("guncellendi damgaları geri yüklendi (trigger'ın ezdiği değerler)");

  /* Trigger geri yükleme sırasında da çalıştı (fiyat yine değişti);
     sınama boyunca oluşan TÜM fiyat_gecmisi kayıtları siliniyor. */
  const silinen = await sql`DELETE FROM fiyat_gecmisi WHERE id > ${fiyatGecmisiTaban} RETURNING id`;
  ok(`sınamanın ürettiği ${silinen.length} fiyat_gecmisi kaydı silindi`);

  const sonrasi = await urunleriOku();
  parmak(sonrasi) === kopyaParmak
    ? ok(`geri yükleme BİREBİR — ${sonrasi.length} ürün, ${ALANLAR.length} alan, satır satır aynı`)
    : no("geri yükleme birebir DEĞİL — aşağıdaki farklar var");

  if (parmak(sonrasi) !== kopyaParmak) {
    const a = kopyaParmak.split("\n"), b = parmak(sonrasi).split("\n");
    for (let i = 0; i < a.length && i < 12; i++) {
      if (a[i] !== b[i]) console.log(`     önce: ${a[i]}\n     sonra: ${b[i]}`);
    }
  }
} catch (e) {
  no(`SINAMA PATLADI: ${e.message}`);
  console.error(e.stack);
} finally {
  /* ═══════ 9. Temizlik ═══════ */
  bolum("9 — Temizlik ve son durum denetimi");

  if (hesapAcildi) {
    // oturumlar.yonetici_id ON DELETE CASCADE: oturumlar da gider
    const s = await sql`DELETE FROM yoneticiler WHERE kullanici_adi = ${kullaniciAdi} RETURNING id`;
    s.length === 1 ? ok("geçici hesap silindi (oturumları cascade ile)") : no("geçici hesap silinemedi");
  }

  const d = await sql`DELETE FROM giris_denemeleri WHERE ip LIKE ${IP_ONEK + "%"} RETURNING id`;
  ok(`sınamanın ürettiği ${d.length} giriş denemesi kaydı silindi`);

  const [[u], [dk], [f], [m], y] = await Promise.all([
    sql`SELECT count(*)::int c FROM urunler`,
    sql`SELECT count(*)::int c FROM urunler WHERE kaynak = 'dukkan'`,
    sql`SELECT count(*)::int c FROM fiyat_gecmisi`,
    sql`SELECT count(*)::int c FROM urunler WHERE miktar IS NULL`,
    sql`SELECT kullanici_adi FROM yoneticiler ORDER BY id`,
  ]);

  if (!taban) {
    no("taban ölçülemedi — sınama hazırlıkta patlamış, son durum kıyaslanamıyor");
  } else {
    const kiyas = (ad, simdi, bekle) =>
      simdi === bekle ? ok(`${ad}: ${simdi} (tabanla aynı)`)
                      : no(`${ad}: ${simdi}, tabanda ${bekle} idi — SINAMA İZ BIRAKTI`);

    kiyas("ürün sayısı", u.c, taban.urun);
    kiyas("kaynak='dukkan' olan ürün", dk.c, taban.dukkan);
    kiyas("miktar IS NULL olan ürün", m.c, taban.miktarNull);

    const [{ enSon: sonGecmis }] = await sql`SELECT COALESCE(max(id), 0)::int AS "enSon" FROM fiyat_gecmisi`;
    f.c === 0 || sonGecmis === taban.fiyatGecmisi
      ? ok(`fiyat_gecmisi: sınamanın eklediği kayıt kalmadı (${f.c} kayıt, taban damgası ${taban.fiyatGecmisi})`)
      : no(`fiyat_gecmisi'nde sınamadan kalan kayıt var (${f.c})`);

    const adlar = y.map((r) => r.kullanici_adi).sort();
    JSON.stringify(adlar) === JSON.stringify(taban.hesaplar)
      ? ok(`hesaplar tabanla aynı: ${adlar.join(", ")}`)
      : no(`hesaplar: ${adlar.join(", ")} — tabanda ${taban.hesaplar.join(", ")} idi`);
  }

  bolum(`YETKİLİ SINAMA SONUÇ: ${g} geçti, ${k} kaldı`);
  process.exit(k === 0 ? 0 : 1);
}
