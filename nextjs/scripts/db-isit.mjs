/* =====================================================================
   Derleme öncesi veritabanını uyandırır.

   NEDEN VAR:
   Next 16'nın Cache Components'inde bir 'use cache' girdisini doldurmak
   için SABİT 50 saniyelik bütçe var (node_modules/next/dist/server/
   use-cache/use-cache-wrapper.js, setTimeout(..., 50000)). Süre dolarsa
   derleme USE_CACHE_TIMEOUT ile ölüyor ve hata metni "muhtemelen isteğe
   özgü veri kullandınız" diyor — bu metin hatanın içine gömülü genel bir
   tahmin, gerçek nedeni ölçmüyor.

   Bizim durumumuzda katalogGetir() isteğe özgü hiçbir şeye dokunmuyor:
   sıfır argümanlı, closure'ı yok, cookies/headers/params kullanmıyor.
   Sorun süreydi. Ölçümler (19-20 Ağustos 2026):

     sıcak DB, 15 eşzamanlı tam katalog sorgusu : en yavaş 383-506 ms
     sıcak derlemede sayfa üretimi              : 4.7 - 6.2 sn
     gece boyu boşta kaldıktan sonraki üretim   : 51 sn   <-- eşik 50 sn

   Yani ilk derleme giyotinin bir saniye üstünden geçiyor; bazen altında
   kalıyor ve derleme çöküyor. Neon boştayken hesaplama birimini askıya
   alıyor, uyanması ~45 sn sürebiliyor ve bu maliyet doğrudan önbellek
   doldurma bütçesinin içinde ödeniyor.

   ÇÖZÜM: uyanma maliyetini bütçenin DIŞINDA ödemek. Bu betik prebuild
   olarak çalışıyor, veritabanı yanıt verene kadar bekliyor; böylece
   'use cache' doldurulurken bağlantı çoktan sıcak oluyor.

   Derlemeyi ENGELLEMİYOR: uyandıramazsa uyarı basıp çıkıyor. Veritabanı
   gerçekten erişilemezse derleme zaten kendi hatasıyla düşecek; burada
   ikinci bir hata biçimi üretmenin faydası yok.
   ===================================================================== */

import { readFileSync, writeFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
// @next/env CommonJS: adlandırılmış dışa aktarım yok, varsayılandan alınıyor
import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;

const DENEME = 5;
const TOPLAM_SINIR_MS = 120_000;

/* Bu betik Next'ten ÖNCE çalıştığı için .env.local henüz yüklü değil.
   Next'in kendi yükleyicisini kullanıyoruz ki dosya sırası ve öncelik
   kuralları derlemedekiyle birebir aynı olsun. Vercel'de değişken zaten
   ortamda tanımlı; orada bu çağrı bir şeyi bozmuyor. */
loadEnvConfig(process.cwd(), false);

const adres = process.env.DATABASE_URL;
if (!adres) {
  // Ne ortamda ne .env dosyalarında var: sessizce geç, derleme kendi
  // hatasını versin — burada ikinci bir hata biçimi üretmeyelim.
  console.log("db-isit: DATABASE_URL yok, ısıtma atlandı");
  process.exit(0);
}

const sql = neon(adres);
const basladi = Date.now();

/* Isıtma sorgusu aynı zamanda ürün kimliklerini topluyor: proxy.ts bu
   listeyi olmayan /urun/<id> adreslerini 404'e çevirmek için kullanıyor
   (gerekçe orada yazılı). Isıtmayı SELECT 1 yerine gerçek katalog
   sorgusuyla yapmak ayrıca daha dürüst: derlemenin atacağı sorgunun
   maliyetini ölçüyor. */
const KIMLIK_DOSYASI = new URL("../src/urun-kimlikleri.json", import.meta.url);

async function kimlikleriYaz(satirlar) {
  const kimlikler = satirlar.map((s) => s.id);
  const yeni = JSON.stringify(kimlikler, null, 0) + "\n";
  try {
    if (readFileSync(KIMLIK_DOSYASI, "utf8") === yeni) {
      console.log(`db-isit: ürün kimlikleri değişmemiş (${kimlikler.length})`);
      return;
    }
  } catch {
    // dosya yok, birazdan yazılacak
  }
  writeFileSync(KIMLIK_DOSYASI, yeni, "utf8");
  console.log(`db-isit: src/urun-kimlikleri.json yazıldı (${kimlikler.length} kimlik)`);
}

for (let deneme = 1; deneme <= DENEME; deneme++) {
  const t = Date.now();
  try {
    const satirlar = await sql`SELECT id FROM urunler ORDER BY id`;
    const ms = Date.now() - t;
    const toplam = Date.now() - basladi;
    console.log(
      `db-isit: veritabanı hazır (${ms} ms, ${deneme}. deneme, toplam ${toplam} ms)`
    );
    await kimlikleriYaz(satirlar);
    if (ms > 5000) {
      console.log(
        "db-isit: uyanma uzun sürdü — bu maliyet artık derlemenin " +
        "50 sn'lik önbellek bütçesinin dışında ödendi"
      );
    }
    process.exit(0);
  } catch (e) {
    const kalan = TOPLAM_SINIR_MS - (Date.now() - basladi);
    if (deneme === DENEME || kalan <= 0) {
      console.warn(
        `db-isit: ısıtılamadı (${deneme} deneme): ${e.message} — derleme yine de sürüyor`
      );
      process.exit(0);
    }
    const bekle = Math.min(2000 * deneme, kalan);
    console.log(`db-isit: ${deneme}. deneme başarısız, ${bekle} ms sonra tekrar`);
    await new Promise((r) => setTimeout(r, bekle));
  }
}
