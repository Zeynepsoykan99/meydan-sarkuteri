# Meydan Şarküteri

Mahalle marketi için tek sayfalık **ürün kataloğu**. Ürünler ve etiket fiyatları
gösterilir; sepet, sipariş ya da ödeme yoktur. Sadece frontend.

**Canlı:** <https://meydan-sarkuteri.vercel.app>

## Çalıştırma

**Bir yerel sunucu gerekiyor:**

```
npm install
npx serve .
```

Veritabanı olmadan da çalışır: `/api/katalog` cevap vermezse sayfa
`data/products.json` yedeğine düşer ve fiyatların güncel olmayabileceğini
söyleyen bir not gösterir.

`index.html`'i çift tıklayıp `file://` ile açmak **çalışmaz**. Ürün verisi artık
`data/products.json` dosyasından `fetch` ile okunuyor; tarayıcılar `file://`
altında `fetch`'i farklı-kaynak sayıp engelliyor. Sayfa bu durumda boş kalmaz,
"Katalog yüklenemedi" hatasını gösterir — ama ürünleri göremezsin.

Bağımlılık, paket yöneticisi ve build adımı yok; yalnızca dosyaları HTTP
üzerinden servis eden bir sunucu yeterli (`npx serve`, `python -m http.server`,
VS Code Live Server — hepsi olur).

## Yayın

Vercel'de, `main` dalına bağlı. Dosyalar olduğu gibi CDN'den servis edilir;
derlenecek bir şey ve çalışan sunucu kodu yok. `main`'e her push production'a
otomatik çıkar. Elle deploy gerekirse:

```
vercel --prod
```

Sayfada iki analitik script'i var: `insights` (sayfa görüntüleme, hangi reyon
geziliyor) ve `speed-insights` (gerçek kullanıcıda LCP/CLS/INP). İkisi Vercel'de
ayrı ürün ve **ayrı ayrı panelden açılır** — açılmayanın script'i 404 döner,
`defer` olduğu için sayfayı etkilemez. Paketsiz kurulum kullanıldı; `package.json`
eklenmedi, çünkü Vercel bunu görünce projeyi Node projesi sanıp build çalıştırmaya
kalkar.

## Veritabanı

Katalog iki yerde durur: **veritabanı** kaynaktır, `data/products.json`
ise son bilinen iyi kopyadır (yedek). Sayfa önce `/api/katalog`'u dener,
olmazsa yedeğe düşer.

### Kurulum

1. [Neon](https://neon.tech) üzerinde bir Postgres oluştur.
2. Bağlantı dizesini `.env.local` içine yaz — değişken adı için
   `.env.example`'a bak. Havuzlanmış (pooled) uç noktayı kullan.
3. Şemayı kur ve veriyi bas:

```
npm install
npm run migrate           # db/schema.sql — iki kez çalıştırmak güvenli
npm run seed              # data/products.json -> veritabanı
npm run seed -- --temiz   # önce boşalt, sonra bas
```

`seed`, `--temiz` olmadan yalnızca ekler; tablo doluysa hata verip
hiçbir şey yazmaz. Sessizce üzerine yazmak, elle düzeltilmiş bir kaydı
fark ettirmeden geri alabilirdi.

### Şema

`db/schema.sql` üç tablo tanımlar: `reyonlar`, `urunler`, `fiyat_gecmisi`.

Ürün id'leri `u001` biçiminde korunuyor — mevcut bağlantılar
(`?urun=u065`) ve fiyat geçmişi bunlara dayanıyor. Yeni id bir
sequence'ten gelir, "en büyük + 1" değil: dizide boşluk var (u139 ve
u258 silinmişti) ve o mantık silinmiş bir numarayı geri kullanıp fiyat
geçmişini yanlış ürüne bağlayabilirdi.

`urunler.fiyat` değişince bir trigger `fiyat_gecmisi`'ne kayıt atar ve
`guncellendi` damgasını tazeler.

CHECK kısıtları `scripts/veri-kontrol.js`'teki kontrollerin veritabanı
karşılığıdır: betik veriyi yazıldıktan sonra denetler, kısıtlar geçersiz
verinin yazılmasını en baştan engeller.

### API

`GET /api/katalog` — yanıt `data/products.json` ile birebir aynı
şekildedir, böylece arayüz iki kaynağı ayırt etmek zorunda kalmaz.
GET dışındaki metodlar 405 döner.

**Yazma ucu yoktur.** Kimlik doğrulama kurulmadan korumasız bir
POST/PUT/DELETE yayına giderse katalogu herkes değiştirebilir.

## Dosyalar

```
index.html               Sayfa iskeleti
css/style.css            Tüm stiller (tek dosya, CSS değişkenleriyle)
js/app.js                Veriyi getirir; filtre, arama, sıralama, birim fiyat, detay
data/products.json       Katalog yedeği — 470 ürün, 13 reyon
api/katalog.js           GET /api/katalog — veritabanından okur
db/schema.sql            Tablolar, kısıtlar, fiyat geçmişi trigger'ı
scripts/migrate.js       Şemayı kurar (idempotent)
scripts/seed.js          JSON'u veritabanına basar
scripts/veri-kontrol.js  Veri doğrulama — hem betik hem modül (aşağıya bak)
og.png                   Paylaşım görseli, siteden üretilmiş 1200×630
vercel.json              Build kapalı; api/ fonksiyonları çalışır
```

### Veri biçimi

`data/products.json` saf JSON'dur, üç üst düzey anahtarı vardır:

```json
{
  "guncellendi": "2026-08-11T00:00:00+03:00",
  "reyonlar": [ { "id": "sarkuteri", "ad": "Et & Şarküteri", "ikon": "🥓" } ],
  "urunler":  [ {
    "id": "u065",
    "ad": "Sütaş %1 Yağlı Süt 1 L",
    "reyon": "kahvaltilik",
    "gorsel": "https://…",
    "fiyat": 39.5,
    "eskiFiyat": 44.5,
    "kaynak": "a101",
    "miktar": 1,
    "birim": "L",
    "stokta": true
  } ]
}
```

- **`miktar` / `birim`** — birim fiyat bunlardan hesaplanır. `birim` yalnızca
  `kg`, `L` ya da `adet` olabilir; `miktar` da o birime çevrilmiş değerdir
  (500 g → `0.5` + `kg`). Ürün adından çıkarılamadıysa **ikisi de `null`**;
  tahmin edilmez. Bu durumda `app.js` adı yeniden ayrıştırmayı dener.
- **`stokta`** — `false` olan ürün kartta "Şu an yok" rozetiyle görünür,
  soluklaşır ve her sıralamada listenin sonuna atılır. Katalogdan çıkarılmaz.
- **`guncellendi`** — ISO 8601. Sayfadaki tarih rozeti ve `sitemap.xml`'in
  `lastmod` değeri bununla hizalıdır (kontrolü `veri-kontrol.js` yapar).
  Kaynak veride yalnızca gün bilgisi vardı; saat kısmı anlamlı değildir.
- Reyonlarda **ürün sayısı tutulmaz** — çalışma anında ürün listesinden
  hesaplanır, böylece veriyle sayaç birbirinden ayrışamaz.

## Neler var

- **Reyon filtresi** — 13 reyon, üstteki kaydırılabilir şeritten seçilir.
- **Arama** — Türkçe karakter duyarsız; "cıkolata" yazsan da "Çikolata"yı bulur.
  `/` tuşu arama kutusuna odaklanır.
- **Sıralama** — reyon sırası, artan/azalan fiyat, birim fiyat, en çok indirim, A–Z.
- **Birim fiyat** — ₺/kg, ₺/L ya da ₺/adet. Önce verideki `miktar`/`birim`
  alanlarına bakılır; onlar boşsa ürün adı ayrıştırılır (`4x80 Ml`, `1,25 L`,
  `32'li` gibi kalıplar dahil). 470 ürünün 382'sinde ölçü var. 1 kg / 1 L
  ambalajda satır basılmaz, çünkü birim fiyat etiket fiyatının aynısı olur.
  Sıralamada ₺/adet ayrı grupta tutulur: ₺1,60/adet ile ₺214/kg kıyaslanabilir
  şeyler değil, tek listede sıralanınca ucuz görünen adetliler başa geçiyordu.
- **Stok durumu** — `stokta: false` olan ürün "Şu an yok" rozetiyle, soluk
  görselle ve listenin sonunda görünür.
- **Ürün ayrıntısı** — karta tıklayınca açılır (native `<dialog>`: Esc ve odak
  tuzağı tarayıcıdan gelir). Büyük görsel, birim fiyat, önceki fiyat ve verinin
  hangi katalogdan geldiği. Adres çubuğuna `?urun=u001` yazılır, bağlantı
  paylaşılabilir, geri tuşu pencereyi kapatır.
- **Filtreler** — "Sadece indirimliler" düğmesi ve fiyat aralığı kutuları.
- **Günün etiketi** — kataloğun en yüksek indirimli ürününden otomatik üretilir.
- **Düşen etiketler** — indirimli ürünlerin yatay rayı. Katalogda hiç indirim
  kalmazsa bu bölüm de ona giden düğme de gizlenir.
- **Veri tarihi rozeti** — vitrinde fiyatların hangi güne ait olduğu yazar.
  Metin `guncellendi` alanından üretilir, elle yazılmaz ki eskimesin.
- **Paylaşılabilir bağlantı** — seçili reyon, arama, sıralama, filtreler ve açık
  ürün adres çubuğuna yazılır (`?reyon=dondurma&ara=çubuk&sirala=ucuz`), geri
  tuşu önceki duruma döner. `file://` ile açıldığında tarayıcı buna izin vermez;
  her şey yine çalışır, yalnızca adres güncellenmez.
- Mobil uyumlu, klavyeyle gezilebilir, `prefers-reduced-motion` desteklenir.
- Ürünleri JavaScript basar; kapalıysa sayfa bunu söyleyen bir uyarı gösterir.

## Tasarım

Kırmızı `#D6202A`, sarı `#FFCE00`, beyaz `#FFFFFF`. Renkler ve ölçüler
`css/style.css` başındaki `:root` bloğunda tanımlı; oradan değiştirmek yeterli.

Sayfanın imzası **fiyat etiketi**: çentikli sarı kart ve kırmızı iğne deliği —
tezgâha elle asılan etiketin karşılığı. Üstteki kırmızı-beyaz şerit bakkal
tentesinden geliyor. Yazı tipleri: Bricolage Grotesque (başlıklar), Figtree (metin).

## Veri

Ürün adları, görselleri ve fiyatları iki kaynaktan, 11 Ağustos 2026'da alınmıştır
ve `data/products.json` içinde statik olarak durur:

| Kaynak | Ürün |
| --- | --- |
| a101.com.tr/kapida | 221 |
| migros.com.tr (Sanal Market) | 249 |

Her ürünün `kaynak` alanı hangi katalogdan geldiğini tutar. Aynı ada sahip ürünler
tekilleştirildi (24 Migros kaydı bu yüzden alınmadı). Görseller ilgili markanın
CDN'inden çekilir, projeye kopyalanmaz — yani o CDN'ler bağlantıyı değiştirirse
görsel düşer. Bu durumda kart boş kalmaz, yerine etiket simgesi konur.

İndirimli fiyatlar yalnızca A101 tarafında var. Migros'ta ürünlerin yanında görünen
"Money ile" fiyatı bir sadakat kartı fiyatı, herkese açık bir indirim değil — bu yüzden
indirim olarak alınmadı, raf fiyatı kullanıldı.

Fiyatlar o günün anlık görüntüsüdür; kendiliğinden güncellenmez.

11 Ağustos 2026'da iki kayıt elle silindi: `10-tl-urunleri` ve `HaftanınYıldızları`.
Bunlar ürün değil, A101 kampanya afişleriydi — kazıyıcı ürün sanmış, biri Temel
Gıda'nın ilk kartı olarak ₺300 etiketiyle duruyordu. Toplam bu yüzden 472 değil 470.

Site bir katalogdur: ürünleri ve fiyatları gösterir, sipariş almaz.

## Veri kontrolü

```
npm run kontrol                        data/products.json'u denetler
node scripts/veri-kontrol.js --api     canlı /api/katalog yanıtını denetler
node scripts/veri-kontrol.js --api=URL başka bir adresi denetler
```

Veri her yeniden üretildiğinde çalıştır. Hata varsa 1 ile çıkar.

Betik ayrıca **modül olarak** kullanılabilir; ileride panelden gelen
kayıtlar da aynı denetimden geçsin, iki yerde iki ayrı doğruluk tanımı
olmasın diye:

```js
import { kataloguDenetle } from './scripts/veri-kontrol.js';
const { hatalar, uyarilar, ozet } = kataloguDenetle(yuk);
```

Yapısal kontrollerin (reyon dağılımı, tekrarlı id/ad, geçersiz fiyat, eksik
görsel, `eskiFiyat > fiyat`, `miktar`/`birim`/`stokta` alanlarının tipi ve
tutarlılığı) yanında **anlamsal** kontroller de yapar — yukarıdaki iki
afiş kaydı yapısal olarak kusursuzdu, o yüzden ilk denetimden geçmişlerdi:

- **Ad makullüğü** — tek kelimelik ya da slug biçimli adlar (`10-tl-urunleri`)
- **Görsel şablonu** — bir kaynağın görselleri aynı kalıptan gelir; sapanı yakalar
  (iki afişin görseli 200×200'dü, gerçek ürünlerin hepsi 400×400)
- **Fiyat aykırılığı** — reyon medyanının 12 katını aşanlar (uyarı)
- **Dosyalar arası tutarlılık** — `index.html`, `README.md` ve `sitemap.xml`
  içindeki ürün sayısı, reyon sayısı ve tarih veriyle uyuşuyor mu

Betiğin bağımlılığı yok ve depoda bilerek `package.json` yok: olsaydı Vercel
projeyi Node projesi sanıp build çalıştırmaya kalkardı, oysa site derlenmeden
servis ediliyor.
