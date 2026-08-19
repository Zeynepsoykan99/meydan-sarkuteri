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
npm run yonetici-ekle     # ilk yöneticiyi oluştur
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

**Katalog uçları yalnızca okur.** Yazma tek bir yerden yapılır:
`PATCH /api/yonetici/urun`, oturum zorunlu (aşağıda "Panel"). Herkese
açık uçların hiçbiri veritabanına yazmaz.

## Yönetici girişi

```
npm run yonetici-ekle
```

Kullanıcı adını sorar, şifreyi **ekrana yazmadan** iki kez ister (en az 12
karakter). Şifre argüman olarak alınmaz — argüman kabuk geçmişine ve `ps`
çıktısına düşer. Kullanıcı zaten varsa, onay sorarak şifresini günceller.

| Uç | Ne yapar |
| --- | --- |
| `POST /api/giris` | `{ kullaniciAdi, parola }` → oturum çerezi |
| `POST /api/cikis` | Oturumu veritabanından siler, çerezi temizler |
| `GET /api/oturum` | Durum sorgusu; oturum yoksa da 200 + `{girisli:false}` |
| `GET /api/yonetici/durum` | **Korumalı** — oturum yoksa 401 |

Nasıl çalıştığı:

- **Şifre** scrypt ile saklanır (her şifreye 16 baytlık rastgele salt).
  Parametreler hash'in içindedir (`scrypt$N$r$p$salt$hash`) ki maliyet
  ileride artırılınca eski kayıtlar da doğrulanabilsin. Karşılaştırma
  `timingSafeEqual` ile yapılır.
- **Oturum jetonu** 32 rastgele bayttır. Veritabanına yalnızca SHA-256
  özeti yazılır; ham jeton sadece çerezde durur. Veritabanı sızsa bile
  özetlerden oturum çalınamaz.
- **Çerez** `HttpOnly`, `Secure`, `SameSite=Lax`, 30 gün.
- **Hız sınırı**: aynı IP'den 15 dakikada 5 başarısız denemeden sonra
  şifre kontrol bile edilmeden 429 döner.
- Kullanıcı bulunamadığında da sahte bir hash doğrulanır; yanıt
  süresinden kullanıcının var olup olmadığı anlaşılmaz. Hata mesajı her
  durumda aynıdır: hangisinin yanlış olduğu söylenmez.
- Kimlik uçları `Cache-Control: no-store` döner; CDN bunları saklamaz.

Ek bir ortam değişkeni **gerekmiyor**: oturumlar veritabanında tutuluyor,
imzalı jeton kullanılmadığı için ayrı bir imza sırrı yok.

## Panel

`/giris.html` → giriş, `/panel.html` → panel. İkisi de `noindex`, arama
motorlarına kapalı, `robots.txt` ile de engelli.

Panel market sahibinin günlük işi için: **fiyat güncellemek.** Dükkânda,
telefonla, elde ürünle kullanılacağı varsayılarak yapıldı — her tasarım
kararı telefon öncelikli.

**Liste.** 470 ürünün tamamı tek seferde çiziliyor (ölçüldü: 45 ms,
görseller lazy). Üstte ilerleme çubuğu ve iki süzgeç: *Fiyatı
onaylanmamış* ve *Ölçüsü eksik*. Sahibin işi bu iki sayıyı düşürmek.

**Hızlı onay.** Her satırın sağındaki ✓ düğmesi, fiyatı değiştirmeden
"bu fiyat doğru" der. Mevcut fiyatı olduğu gibi gönderir; sunucu
`kaynak`'ı `dukkan` yapar, değer değişmediği için fiyat geçmişine kayıt
düşmez. Dokunulduğu anda satır onaylı görünür, istek arkada gider;
başarısız olursa satır eski hâline döner ve ekranın altında kalıcı bir
bildirim çıkar. İşin büyük kısmı bu akış.

**Düzenleme.** Satıra dokununca açılır: fiyat, indirim anahtarı, stok,
miktar/birim. Virgüllü giriş kabul edilir (`39,5`). Fiyat on kattan fazla
değişiyorsa **kaydetmeden önce** sorulur; sunucunun kendi uyarısı (reyon
medyanı gibi istemcinin bilmediği sinyaller) buna ek olarak çalışır ve
tek dokunuşla geri alınabilir.

Ürün ekleme/silme, toplu düzenleme ve sıralama **yoktur**.

| Uç | Ne yapar |
| --- | --- |
| `GET /api/yonetici/urunler` | **Korumalı** — panelin listesi, `no-store` |
| `PATCH /api/yonetici/urun` | **Korumalı** — tek ürün; yalnızca fiyat, eski fiyat, miktar, birim, stok |

`ad`, `reyon`, `gorsel`, `id` ve `kaynak` panelden değiştirilemez.
Oturum sunucuda yoksa uçlar 401 döner; panel bunu yakalayınca hemen
yönlendirmez, önce hangi işin kaydedilmediğini adıyla söyler.

## Dükkân bilgileri

`data/dukkan.json` — adres, çalışma saatleri, telefon, sipariş ve ödeme.
Sayfada iki yere basılıyor: üstteki tek satırlık şerit (açık/kapalı +
telefon + WhatsApp) ve katalogdan sonraki bölüm. Başlıktaki açılış
bilgisi ile altbilgi de bu dosyadan tazeleniyor; iki yerde çelişen saat
göstermemek için.

**Veritabanında değil, dosyada.** Yılda bir kez değişiyor, panelden
düzenlenmiyor, ve dosyada durunca veritabanı düştüğünde bile bu bölüm
görünmeye devam ediyor.

### dolduruldu bayrağı

```json
{ "dolduruldu": true, "ad": "Meydan Şarküteri", ... }
```

`false` iken bölüm de şerit de **hiç çizilmiyor**, başlık ve altbilgi
`index.html`'de yazan yedek metinde kalıyor, konsola tek satır uyarı
düşüyor. Sayfanın geri kalanı etkilenmiyor.

Bayrak, dosyanın örnek değerlerle yayına kaçmasına karşı. Örnek saatler
çalışır değerler taşıyor: bayrak olmasa doldurulmamış bir dosya
ziyaretçiye **yanlış saat** gösterirdi ve hiçbir yerde "DOLDURULACAK"
yazmazdı.

### Bilgiler değişince

Bilgi **üç yerde** duruyor ve üçü elle eşleniyor. `veri-kontrol.js`
uyuşmazlığı yakalar, ama düzeltmek sende:

| Dosya | Ne var | Neden elle |
| --- | --- | --- |
| `data/dukkan.json` | asıl kaynak | siteyi bu besliyor |
| `index.html` | `.acilis` ve `.ayak-marka` | JS gelmeden / dosya okunamazsa / `dolduruldu:false` iken görünen yedek metinler |
| `afis.html` | `.afis-ust` ve `.afis-alt` | basılan afiş; JS'e bağlamak yazdırmayı kırılganlaştırırdı |

1. `data/dukkan.json`'ı düzenle.
2. Değişen bilgiye göre `index.html` ve `afis.html`'deki metinleri de
   güncelle.
3. `node scripts/veri-kontrol.js` — iki şeyi birden denetler:
   bayrak açıkken hiçbir alanda "DOLDURULACAK" kalmadığını ve
   ad/adres/telefon/saatin **üç dosyada da tutarlı** olduğunu.
   Uyuşmazlıkta hangi dosyada ne yazması gerektiğini söyler ve
   çıkış kodu 1 döner.
4. **Adres, telefon ya da saat değiştiyse afişi yeniden bas.** Duvardaki
   kâğıt kendiliğinden güncellenmiyor. QR'ı yeniden üretmek yalnızca
   *site adresi* değişirse gerekir (aşağıda "Kapı afişi").
5. `node tests/dukkan.mjs` (yerel sunucu ayaktayken).
6. Commit'le ve push'la.

### Alanlar

| Alan | Boş bırakılırsa |
| --- | --- |
| `iletisim.telefon` | "Ara" düğmesi ve İletişim kutusu çıkmaz |
| `iletisim.whatsapp` | WhatsApp düğmesi çıkmaz |
| `adres.haritaUrl` | "Haritada göster" bağlantısı çıkmaz |
| `saatler` | açık/kapalı göstergesi ve saat kutusu çıkmaz |
| `siparis.var: false` + boş `odeme` | "Sipariş ve ödeme" kutusu tamamen kaybolur |

`gunler` alanı gün adı (`Pazar`), aralık (`Pazartesi – Cumartesi`),
liste (`Cumartesi, Pazar`) ya da toplu ifade (`Her gün`, `Hafta içi`,
`Hafta sonu`) kabul eder. Gece yarısını aşan saatler (`22:00`–`02:00`)
doğru hesaplanır. Açık/kapalı hesabı **Europe/Istanbul**'a sabit;
ziyaretçinin cihaz saat dilimi dikkate alınmaz.

## Kapı afişi

`afis.html` — kapıya asılacak, A4 dikey, basılmak için. Ortasında
`qr.svg`; okutan müşteri doğrudan siteye gidiyor. Alan adı alınmadığı
için adres uzun ve tirelidir, kimse elle yazmaz.

**Basmak için:** `afis.html`'i tarayıcıda aç → Yazdır → **A4, dikey,
kenar boşluğu "Yok"**. Tek sayfaya sığar. Renkli basmaya gerek yok;
tasarım siyah-beyaz yazıcıya göre yapıldı, QR koyu mürekkep beyaz zemin.

QR'ın basılı boyutu **9 cm**. Ölçüldü: 3 cm'e kadar küçültülse, gri
tonlamaya indirilse, bulanıklaştırılsa ya da soluk tonerle basılsa bile
okunuyor (hata düzeltme seviyesi Q, %25).

`robots.txt` afişi engelliyor, sayfada `noindex` var, `sitemap.xml`'e
girmiyor — bu sayfa aranmak için değil.

### QR yeniden üretmek gerekirse

Adres değişirse (alan adı alınırsa) `qr.svg` yeniden üretilmeli.
Projede kalıcı bağımlılık **yok**; tek seferlik araçla üretildi:

```
mkdir /tmp/qr && cd /tmp/qr && npm i qrcode
node -e "require('qrcode').toString('https://YENI-ADRES',   { type:'svg', errorCorrectionLevel:'Q', margin:2,     color:{dark:'#1B1917',light:'#FFFFFF'} })   .then(s => require('fs').writeFileSync('qr.svg', s))"
```

Çıktıyı `qr.svg` olarak depoya koy, aracı bırakma. `afis.html`'deki
adres metnini de güncellemeyi unutma.

## Yedek

```
npm run yedek-al
```

Veritabanındaki güncel katalogu `data/products.json`'a yazar. Bu dosya
**arayüzün yedeğidir**: `/api/katalog` düşerse `js/app.js` ona düşer ve
site fiyatları göstermeye devam eder — o yüzden `.vercelignore`'a
yazılmaz, deploy'a girer.

**Ne zaman çalıştırmalı:** sahibi panelden bir grup fiyatı güncelledikten
sonra. Çalıştırılmazsa yedek eskir ve bir arıza anında site aylar öncesinin
fiyatlarını gösterir.

Panel bunu kendisi hatırlatıyor: veritabanının en yeni kaydı ile yedek
dosyasının damgası arasında **7 günden fazla** fark varsa girişte
kapatılabilir bir bilgi şeridi çıkar (*"Yedek kopya 52 gün eskidi…"*).
Şerit sahibe bir düğme sunmaz — yedek almak terminal işi, esnafın işi
değil. Şeridi gören kişi bu komutu çalıştırmalı, sonra değişikliği
commit'leyip push etmeli.

Betik yazmadan önce dosyayı `.onceki` uzantısıyla kopyalar, yazdıktan
sonra geri okuyup doğrular; doğrulama başarısız olursa eski dosyayı geri
koyar. Çalışma dizini kirliyse uyarır.

```
node scripts/deneme-yedegi.js al|dogrula|geri|sina
```

Geliştirme aracı, deploy'a girmez (`scripts/` `.vercelignore`'da).
`urunler` tablosunun tam kopyasını alır ve geri yükler — panelde elle
deneme yaparken veritabanını sınama öncesine döndürmek için. `sina`
komutu güvenlik ağının kendisini doğrular: bir ürünü bozar, geri yükler,
tabloyu kopyayla karşılaştırır.

## Dosyalar

```
index.html               Sayfa iskeleti
giris.html               Yönetici girişi (noindex)
panel.html               Fiyat paneli (noindex)
css/style.css            Ana sitenin stilleri (tek dosya, CSS değişkenleriyle)
css/panel.css            Panelin stilleri — ziyaretçi bu dosyayı hiç indirmez
js/ortak.js              Ana site ile panelin ortak yardımcıları
js/app.js                Veriyi getirir; filtre, arama, sıralama, birim fiyat, detay
js/panel.js              Panel: liste, hızlı onay, düzenleme
data/products.json       Katalog yedeği — 470 ürün, 13 reyon
data/dukkan.json         Adres, saatler, iletişim (dolduruldu bayrağı)
js/dukkan.js             Dükkân bölümü, açık/kapalı hesabı
tests/                   Tarayıcı sınamaları (deploy'a girmez)
afis.html                Kapıya asılacak A4 afiş (noindex)
qr.svg                   Siteye giden kare kod, afişte kullanılıyor
api/katalog.js           GET /api/katalog — veritabanından okur
api/giris.js             Giriş, çıkış, oturum durumu
api/yonetici/            Korumalı uçlar: durum, urunler, urun
api/_lib/                Ortak sunucu kodu — alt çizgi fonksiyon üretimini engeller
db/schema.sql            Tablolar, kısıtlar, fiyat geçmişi trigger'ı
scripts/migrate.js       Şemayı kurar (idempotent)
scripts/seed.js          JSON'u veritabanına basar
scripts/veri-kontrol.js  Veri doğrulama — hem betik hem modül (aşağıya bak)
scripts/yonetici-ekle.js Yönetici hesabı açar / şifre günceller
scripts/yedek-al.js      Veritabanını data/products.json'a yazar
scripts/deneme-yedegi.js Geliştirme aracı: tabloyu kopyalar ve geri yükler
og.png                   Paylaşım görseli, siteden üretilmiş 1200×630
vercel.json              Build kapalı; api/ fonksiyonları çalışır
.vercelignore            db/, scripts/ ve şifre dosyası yayına girmez
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
