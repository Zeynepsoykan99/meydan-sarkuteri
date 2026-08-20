/* Aşama 2 Sınamaları: Giriş, Panel, Afiş, Kimlik Doğrulama ve Yönetici Uçları */

const B = process.env.ADRES || "http://localhost:3001";

let g = 0, k = 0;
const ok = (m) => { console.log(`  ✓ ${m}`); g++; };
const no = (m) => { console.log(`  ✗ ${m}`); k++; };
const bolum = (t) => console.log(`\n${"═".repeat(62)}\n${t}\n${"═".repeat(62)}`);

/* ═══════ 1. Sayfa Yanıtları ═══════ */
bolum("1 — Sayfaların Erişilebilirliği");
{
  const afisRes = await fetch(B + "/afis");
  afisRes.status === 200 ? ok("/afis 200 OK") : no(`/afis ${afisRes.status}`);
  const afisHtml = await afisRes.text();
  afisHtml.includes("/qr.svg") ? ok("/afis QR görseli içeriyor") : no("QR yok");
  afisHtml.includes("size: A4 portrait") ? ok("/afis A4 yazdırma stili içeriyor") : no("A4 stili yok");

  const girisRes = await fetch(B + "/giris");
  girisRes.status === 200 ? ok("/giris 200 OK") : no(`/giris ${girisRes.status}`);
  const girisHtml = await girisRes.text();
  girisHtml.includes("Tezgâh yönetimi") ? ok("/giris başlığı doğru") : no("başlık yok");

  const panelRes = await fetch(B + "/panel");
  panelRes.status === 200 ? ok("/panel 200 OK") : no(`/panel ${panelRes.status}`);

  const robotsRes = await fetch(B + "/robots.txt");
  const robotsText = await robotsRes.text();
  robotsText.includes("Disallow: /giris") && robotsText.includes("Disallow: /panel") && robotsText.includes("Disallow: /afis")
    ? ok("robots.txt /giris, /panel ve /afis için disallow içeriyor")
    : no("robots.txt eksik");
}

/* ═══════ 2. Korumalı API Uçları (Yetkisiz İstekler) ═══════ */
bolum("2 — Korumalı API Uçları Güvenliği (Yetkisiz Erişim Reddi)");
{
  const otRes = await fetch(B + "/api/oturum");
  const otData = await otRes.json();
  otRes.status === 200 && otData.girisli === false
    ? ok("GET /api/oturum çerezsiz girisli: false dönüyor")
    : no(`/api/oturum ${otRes.status}`);

  const durumRes = await fetch(B + "/api/yonetici/durum");
  durumRes.status === 401
    ? ok("GET /api/yonetici/durum oturumsuz 401 dönüyor")
    : no(`/api/yonetici/durum ${durumRes.status}`);

  const urunlerRes = await fetch(B + "/api/yonetici/urunler");
  urunlerRes.status === 401
    ? ok("GET /api/yonetici/urunler oturumsuz 401 dönüyor")
    : no(`/api/yonetici/urunler ${urunlerRes.status}`);

  const patchRes = await fetch(B + "/api/yonetici/urun", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "u001", fiyat: 100 }),
  });
  patchRes.status === 401
    ? ok("PATCH /api/yonetici/urun oturumsuz 401 dönüyor")
    : no(`/api/yonetici/urun ${patchRes.status}`);
}

/* ═══════ 3. Giriş API Ucu Doğrulamaları ═══════ */
bolum("3 — Giriş Ucu Doğrulama ve Savunmalar");
{
  const bosRes = await fetch(B + "/api/giris", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  bosRes.status === 400
    ? ok("POST /api/giris boş gövdede 400 dönüyor")
    : no(`/api/giris boş ${bosRes.status}`);

  const hataliRes = await fetch(B + "/api/giris", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kullaniciAdi: "olmayan_kullanici", parola: "yanlis_parola_123" }),
  });
  hataliRes.status === 401
    ? ok("POST /api/giris hatalı bilgide 401 dönüyor (sahte hash korumalı)")
    : no(`/api/giris hatalı ${hataliRes.status}`);

  const turRes = await fetch(B + "/api/giris", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: "test",
  });
  turRes.status === 415
    ? ok("POST /api/giris JSON olmayan Content-Type'ı 415 ile reddediyor")
    : no(`/api/giris tur ${turRes.status}`);
}

/* ═══════ 4. Ürün adresleri: var olan 200, olmayan 404 ═══════ */
bolum("4 — /urun/[id] durum kodları (500 regresyonu nöbeti)");
{
  /* Bu bölüm bir GERİLEME NÖBETİ. Next 16.2.12 + cacheComponents'te
     SSG rotasında notFound() 500 üretiyordu (app-page.js: "revalidate
     0 < 1"). src/proxy.ts isteği sayfaya varmadan kesiyor. Buradaki
     asıl sınama "404 mü" değil, "500 DEĞİL Mİ" — proxy kaldırılır ya da
     matcher bozulursa bu bölüm anında kırmızıya döner. */
  const gecerli = await fetch(B + "/urun/u001");
  gecerli.status === 200 ? ok("/urun/u001 (var olan ürün) 200") : no(`/urun/u001 ${gecerli.status}`);

  const olmayanlar = ["u999", "yok-boyle-bir-sey", "xyz", "U001", "u001%27%3B%20DROP--"];
  for (const id of olmayanlar) {
    const y = await fetch(`${B}/urun/${id}`);
    if (y.status === 404) ok(`/urun/${id} → 404`);
    else if (y.status === 500) no(`/urun/${id} → 500 — REGRESYON, proxy devre dışı kalmış olabilir`);
    else no(`/urun/${id} → ${y.status}, 404 bekleniyordu`);
  }

  const govde = await (await fetch(B + "/urun/u999")).text();
  govde.includes("Tezgâhta bulamadık")
    ? ok("404 gövdesi app/not-found.tsx içeriğini taşıyor (çıplak hata sayfası değil)")
    : no("404 gövdesi beklenen not-found içeriğini taşımıyor");
}

console.log(`\n${"═".repeat(62)}\nAŞAMA 2 SONUÇ: ${g} geçti, ${k} kaldı`);
process.exit(k === 0 ? 0 : 1);
