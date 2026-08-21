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

import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
// @next/env CommonJS: adlandırılmış dışa aktarım yok, varsayılandan alınıyor
import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;

const DENEME = 5;
const TOPLAM_SINIR_MS = 120_000;

/* data/dukkan.json — depo kökünde duruyor, tek doğruluk kaynağı orası.
   Kopyası nextjs/src/data/ altına alınıyor: lib/dukkan.ts onu MODÜL OLARAK
   import ediyor (readFile değil), çünkü process.cwd() ile kurulan yolları
   Next'in dosya izleyicisi izleyemiyor ve Vercel'de Root Directory dışına
   erişim kısıtlı. src/ altında duruyor ki katalog-anlik.json ile aynı
   desende olsun ve tsconfig kapsamına girsin. */
function dukkanKopyala() {
  const kaynak = new URL("../../data/dukkan.json", import.meta.url);
  const hedefDir = new URL("../src/data/", import.meta.url);
  const hedef = new URL("../src/data/dukkan.json", import.meta.url);
  try {
    if (!existsSync(hedefDir)) mkdirSync(hedefDir, { recursive: true });
    copyFileSync(kaynak, hedef);
    console.log("db-isit: data/dukkan.json -> nextjs/src/data/dukkan.json kopyalandi");
  } catch (e) {
    /* ARTIK YUTULMUYOR. Eskiden "sorun değil, eski yol denenecek" deyip
       geçiyordu — ama artık eski yol yok: lib/dukkan.ts dosyayı modül
       olarak import ediyor. Kopyalama başarısız olursa depodaki kopya
       eskimiş demektir ve kimse fark etmez. Yüksek sesle söylüyoruz. */
    console.error("");
    console.error("  ⚠ db-isit: data/dukkan.json KOPYALANAMADI");
    console.error(`    sebep: ${e.message}`);
    console.error("    nextjs/src/data/dukkan.json depodaki (muhtemelen eski) halinde kaliyor.");
    console.error("    Vercel'de bu, Root Directory disina erisimin kapali oldugu anlamina gelir:");
    console.error("    Settings -> Build and Deployment -> 'Include source files outside of");
    console.error("    the Root Directory in the Build Step' kutucugunu isaretle.");
    console.error("");
  }
}

/* Bu betik Next'ten ÖNCE çalıştığı için .env.local henüz yüklü değil.
   Next'in kendi yükleyicisini kullanıyoruz ki dosya sırası ve öncelik
   kuralları derlemedekiyle birebir aynı olsun. Vercel'de değişken zaten
   ortamda tanımlı; orada bu çağrı bir şeyi bozmuyor. */
loadEnvConfig(process.cwd(), false);

/* Dükkân bilgisini nextjs/data/ altına kopyala (Vercel uyumluluğu). */
dukkanKopyala();

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
const ANLIK_DOSYASI = new URL("../src/katalog-anlik.json", import.meta.url);

/* Katalogun derleme anındaki tam kopyası. lib/katalog.ts veritabanına
   ulaşamadığında buna düşüyor ve ziyaretçiye "fiyatlar X tarihli" diyor —
   kökteki data/products.json yedeğinin karşılığı. Depoya giriyor ki
   veritabanı erişilemezken de derleme yapılabilsin. */
async function anlikYaz(sql) {
  const [reyonlar, urunler, damga] = await Promise.all([
    sql`SELECT id, ad, ikon FROM reyonlar ORDER BY sira NULLS LAST, id`,
    sql`SELECT id, ad, reyon, gorsel, fiyat, eski_fiyat, miktar, birim, stokta, kaynak
          FROM urunler ORDER BY id`,
    sql`SELECT max(guncellendi) AS en_son FROM urunler`,
  ]);
  const sayi = (v) => (v === null || v === undefined ? null : Number(v));
  /* "alindi" (derleme duvar saati) BİLEREK YOK. Her derlemede değişen tek
     alan oydu ve dosyayı sürekli "kirli" gösteriyordu: hiçbir şey
     değişmese bile git status bir fark bildiriyordu, gerçek veri
     değişiklikleri de o gürültünün içinde kayboluyordu.

     Damga olarak ürünlerin guncellendi alanlarının EN BÜYÜĞÜ kullanılıyor;
     veriden türüyor, veri değişmedikçe değişmiyor. Ayrıca panelde
     gösterilecek doğru bilgi de bu: ziyaretçiyi ilgilendiren "derleme ne
     zaman koştu" değil, "fiyatlar en son ne zaman değişti". */
  const paket = {
    guncellendi: damga[0]?.en_son ? new Date(damga[0].en_son).toISOString() : null,
    reyonlar,
    urunler: urunler.map((u) => ({
      id: u.id, ad: u.ad, reyon: u.reyon, gorsel: u.gorsel,
      fiyat: sayi(u.fiyat) ?? 0, eskiFiyat: sayi(u.eski_fiyat),
      kaynak: u.kaynak, miktar: sayi(u.miktar), birim: u.birim, stokta: u.stokta,
    })),
  };
  writeFileSync(ANLIK_DOSYASI, JSON.stringify(paket) + "\n", "utf8");
  console.log(`db-isit: src/katalog-anlik.json yazıldı (${paket.urunler.length} ürün, damga ${paket.guncellendi})`);
}

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
    await anlikYaz(sql);
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
