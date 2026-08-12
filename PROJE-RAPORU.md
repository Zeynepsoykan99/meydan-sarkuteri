# Proje Raporu — Meydan Şarküteri

Bu rapor, depodaki dosyaların doğrudan okunmasıyla hazırlanmıştır. Dosyalarda
karşılığı bulunamayan bilgiler "tespit edilemedi" olarak işaretlenmiştir.

- **Rapor tarihi:** 12 Ağustos 2026
- **İncelenen dal / commit:** `main` / `dbf93de`
- **Depo:** https://github.com/Zeynepsoykan99/meydan-sarkuteri
- **Yayında:** https://meydan-sarkuteri.vercel.app

---

## 1. TEKNOLOJİ

### Framework / kütüphane ve sürümleri

**Yok — bağımlılık kullanılmıyor.**

`package.json`, `package-lock.json`, `composer.json`, `composer.lock`,
`yarn.lock`, `pnpm-lock.yaml`, `bun.lockb` dosyalarının **hiçbiri depoda yok**.
Bu nedenle sürüm listelenebilecek bir bağımlılık manifestosu bulunmuyor.

Proje saf **vanilla JavaScript** ile yazılmış. `js/app.js` tek bir IIFE
(`(function () { 'use strict'; ... })()`) içinde çalışıyor; modül sistemi,
`import`/`export` veya derleme gerektiren sözdizimi kullanılmıyor.

Depodaki tek dış kaynak bağımlılığı, `index.html` içinden çağrılan üç uzak alan adı:

| Alan adı | Ne için |
| --- | --- |
| `fonts.googleapis.com` / `fonts.gstatic.com` | Bricolage Grotesque ve Figtree yazı tipleri |
| `meydan-sarkuteri.vercel.app` | `og:image` ve `og:url` meta etiketlerindeki mutlak adresler |

Ayrıca Vercel'in platform tarafından servis edilen iki analitik script'i
(`/_vercel/insights/script.js`, `/_vercel/speed-insights/script.js`) sayfaya
paketsiz biçimde bağlanmış — bunlar depoda dosya olarak durmuyor, Vercel
tarafından çalışma anında sunuluyor.

### Build aracı ve build/dev komutları

**Build aracı yok.** `vite.config.js`, `webpack.config.js`, `rollup.config.js`,
`gulpfile.js`, `Gruntfile.js`, `tsconfig.json`, `.babelrc`, `Makefile`
dosyalarının hiçbiri mevcut değil.

`package.json` olmadığı için **npm script'i de yok**. `README.md`'de belgelenen
ve depoda karşılığı bulunan komutlar şunlar:

| Amaç | Komut | Kaynak |
| --- | --- | --- |
| Yerel geliştirme | `npx serve .` | `README.md` |
| Yerel geliştirme (alternatif) | `index.html`'i doğrudan tarayıcıda açmak | `README.md` |
| Veri doğrulama | `node scripts/veri-kontrol.js` | `README.md`, `scripts/veri-kontrol.js` |
| Elle yayın | `vercel --prod` | `README.md` |

`scripts/veri-kontrol.js` dosyasının başındaki yorumda, `package.json`
bulunmamasının bilinçli bir tercih olduğu açıkça yazılmış: depoda `package.json`
olursa Vercel projeyi Node projesi sanıp build çalıştırmaya kalkıyor, oysa site
derlenmeden servis ediliyor.

### CSS yaklaşımı

**Saf CSS, tek dosya.** `css/style.css` — 603 satır.

- Tailwind, Bootstrap, Bulma veya Foundation izi **yok**
  (`@tailwind`, `@apply`, `bootstrap` gibi hiçbir direktif bulunamadı).
- CSS ön işlemcisi (Sass/Less/PostCSS) **yok**; `postcss.config.js` ve
  `tailwind.config.js` mevcut değil.
- Tasarım belirteçleri `:root` bloğunda **19 CSS özel değişkeni** olarak tutuluyor:
  renkler (`--kirmizi`, `--sari`, `--murekkep`…), yazı tipi aileleri
  (`--display`, `--govde`), köşe yarıçapları, gölgeler, kap genişliği
  (`--kucak-en`) ve yapışkan başlık yüksekliği (`--baslik-yuk`).
- Duyarlılık **3 adet `@media` sorgusuyla** sağlanıyor: `max-width: 1020px`,
  `max-width: 780px` ve `prefers-reduced-motion: reduce`.
- Sınıf adları Türkçe ve anlamsal (`.kart`, `.reyon`, `.etiket`, `.vitrin`).
  Yardımcı sınıf (utility-first) yaklaşımı kullanılmamış.

---

## 2. KLASÖR YAPISI

3 seviye derinlik. `node_modules`, `.git`, `dist`, `build` hariç tutulmuştur
(bunlardan yalnızca `.git` fiilen mevcut; diğer üçü zaten yok).

```
.
├── .env.local                  (gizli, .gitignore'da)
├── .gitignore
├── .vercel/                    (gizli, .gitignore'da)
│   ├── project.json
│   └── README.txt
├── css/
│   └── style.css
├── index.html
├── js/
│   ├── app.js
│   └── products.js
├── og.png
├── README.md
├── robots.txt
├── scripts/
│   └── veri-kontrol.js
└── sitemap.xml
```

Dosya envanteri:

| Dosya | Satır | Boyut | Rolü |
| --- | ---: | ---: | --- |
| `js/products.js` | 4.326 | 124,6 KB | Ürün ve reyon verisi |
| `css/style.css` | 603 | 21,1 KB | Tüm stiller |
| `js/app.js` | 567 | 21,0 KB | Uygulama mantığı |
| `scripts/veri-kontrol.js` | 246 | 9,0 KB | Veri doğrulama (tarayıcıda çalışmaz) |
| `index.html` | 206 | 9,3 KB | Tek sayfa iskeleti |
| `README.md` | 132 | 6,4 KB | Belgelendirme |
| `sitemap.xml` | 11 | 441 B | SEO |
| `robots.txt` | 4 | 81 B | SEO |
| `og.png` | — | 104,5 KB | Paylaşım görseli (1200×630) |

Not: `.gitignore` içeriği `.playwright-mcp/`, `Thumbs.db`, `desktop.ini`,
`.DS_Store`, `.vercel` ve `.env*` girdilerinden oluşuyor.

---

## 3. ÜRÜN VE FİYAT VERİSİ

### Verinin bulunduğu dosya

**Tam yol:** `C:\Users\Zeynep\Desktop\dükkan\js\products.js`
(depo köküne göre: `js/products.js`)

Ürün ve fiyat verisinin tamamı **yalnızca bu dosyada** duruyor. Başka hiçbir
dosyada ürün kaydı bulunmuyor.

### Veri formatı

**JS objesi** — daha kesin olarak: klasik `<script>` etiketiyle yüklenen,
global kapsamda **üç `const` tanımlayan düz bir JavaScript dosyası.**

JSON dosyası değil, veritabanı değil, HTML'e gömülü değil. Değerler JSON
sözdiziminde yazılmış (anahtarlar çift tırnaklı) ama dosya `.js` ve
`const ... = [...]` ataması içeriyor, yani `fetch` ile değil `<script src>`
ile yükleniyor.

Dosyanın tanımladığı üç global:

| Global | Tip | İçerik |
| --- | --- | --- |
| `VERI_TARIHI` | `string` | `'2026-08-11'` — fiyatların çekildiği tarih |
| `REYONLAR` | `Array<Object>` | 13 kategori |
| `URUNLER` | `Array<Object>` | 470 ürün |

Yükleme sırası `index.html` içinde sabit — veri, uygulamadan **önce** yükleniyor:

```html
<script src="js/products.js"></script>
<script src="js/app.js"></script>
```

Dosyanın başındaki yorumda "Bu dosya otomatik üretilmiştir; elle düzenlemek
yerine veriyi yeniden çekin" notu var. Üretimi yapan kazıyıcı betik **depoda
bulunmuyor** — yalnızca üretilen çıktı sürüm kontrolünde.

### Tek bir ürün kaydının tüm alanları

Ürün kayıtlarının **7 alanı** var. İndirimsiz bir örnek:

```js
{
  "id": "u002",
  "ad": "Aytaç Isıl İşlem Görmüş Kangal Sucuk 200 G",
  "reyon": "sarkuteri",
  "gorsel": "https://images.migrosone.com/sanalmarket/product/14209403/14209403-45abf9.jpg",
  "fiyat": 335,
  "eskiFiyat": null,
  "kaynak": "migros"
}
```

İndirimli bir örnek (`eskiFiyat` dolu):

```js
{
  "id": "u065",
  "ad": "Sütaş %1 Yağlı Süt 1 L",
  "reyon": "kahvaltilik",
  "gorsel": "https://cdn2.a101.com.tr/dbmk89vnr/CALL/Image/get/IPhs9WBJOf_400x400.png",
  "fiyat": 39.5,
  "eskiFiyat": 44.5,
  "kaynak": "a101"
}
```

Alan sözlüğü:

| Alan | Tip | Açıklama |
| --- | --- | --- |
| `id` | `string` | `u001`–`u472` biçiminde tekil kimlik. **Sıra boşluklu**: silinen iki kayıt yüzünden `u139` ve `u258` yok |
| `ad` | `string` | Ürün adı; miktar bilgisi (`200 G`, `1 L`, `32'li`) ad metninin içinde, ayrı alan olarak tutulmuyor |
| `reyon` | `string` | `REYONLAR[].id` değerlerinden birine karşılık gelir (yabancı anahtar) |
| `gorsel` | `string` | Uzak CDN'deki görselin mutlak HTTPS adresi |
| `fiyat` | `number` | Güncel fiyat, TL. Ondalık nokta ile (`39.5`) |
| `eskiFiyat` | `number \| null` | İndirim öncesi fiyat; indirim yoksa `null` |
| `kaynak` | `string` | `"a101"` veya `"migros"` |

Reyon kayıtlarının **4 alanı** var:

```js
{
  "id": "sarkuteri",
  "ad": "Et & Şarküteri",
  "ikon": "🥓",
  "adet": 39
}
```

`adet` alanı, o reyondaki ürün sayısının **elle tutulan kopyasıdır**; gerçek
sayımla tutarlılığı `scripts/veri-kontrol.js` tarafından denetleniyor.

**Çalışma anında eklenen alanlar:** `js/app.js`, açılışta her ürüne alt çizgiyle
başlayan dört geçici alan ekliyor. Bunlar `products.js`'te **yok**, diske yazılmaz:
`_ara` (Türkçe karakterden arındırılmış arama dizini), `_bf` (sayısal birim fiyat),
`_bfYazi` (biçimlenmiş birim fiyat metni), `_bfGrup` (sıralama grubu).

### Ürün ve kategori sayısı

- **470 ürün**
- **13 kategori** ("reyon")

Kaynak dağılımı: A101 Kapıda **221**, Migros Sanal Market **249**.
İndirimli ürün: **37** (tamamı A101 kaynaklı).

Kategori dökümü:

| id | Ad | İkon | Ürün |
| --- | --- | --- | ---: |
| `sarkuteri` | Et & Şarküteri | 🥓 | 39 |
| `kahvaltilik` | Süt & Kahvaltılık | 🧀 | 36 |
| `meyve-sebze` | Meyve & Sebze | 🍅 | 41 |
| `firin` | Fırından | 🍞 | 22 |
| `temel-gida` | Temel Gıda | 🫒 | 38 |
| `atistirmalik` | Atıştırmalık | 🍫 | 58 |
| `icecek` | Su & İçecek | 🥤 | 41 |
| `donuk` | Donuk Gıda | 🧊 | 26 |
| `dondurma` | Dondurma | 🍦 | 26 |
| `temizlik` | Temizlik | 🧽 | 47 |
| `kagit` | Kağıt Ürünleri | 🧻 | 42 |
| `bakim` | Kişisel Bakım | 🧴 | 39 |
| `ev` | Ev & Yaşam | 🍽️ | 15 |
| | **Toplam** | | **470** |

### Görseller nerede duruyor, nasıl referans veriliyor

**Görseller projede durmuyor.** 470 ürün görselinin tamamı, kaynak
perakendecilerin CDN'lerinden mutlak HTTPS adresiyle çekiliyor (hotlink):

| CDN | Görsel |
| --- | ---: |
| `cdn2.a101.com.tr` | 221 |
| `images.migrosone.com` | 249 |

Depoda duran tek görsel dosyası `og.png`'dir (sosyal paylaşım kartı, 1200×630).
Site ikonu (favicon) ise `index.html` içine gömülü bir `data:image/svg+xml`
adresidir; ayrı dosya değildir.

Referans verme biçimi — `js/app.js` içindeki `kartHtml()` fonksiyonu, `gorsel`
alanını doğrudan `src` özniteliğine basıyor:

```js
<img class="kart-gorsel" src="${kacar(u.gorsel)}" alt="${kacar(u.ad)}"
     loading="lazy" decoding="async" width="400" height="400">
```

`kacar()` HTML kaçışı yapan yardımcı fonksiyondur. `loading="lazy"` sayesinde
470 görselin tamamı değil, yalnızca görünüm alanına girenler indiriliyor.

Görsel yüklenemezse `js/app.js` içindeki genel `error` yakalayıcısı devreye
girip görseli gizliyor ve kabına `gorsel-yok` sınıfını ekliyor; CSS bu sınıfa
🏷️ yer tutucusu basıyor. Yani CDN düşerse kartlar boş çerçeve olarak kalmıyor.

---

## 4. SAYFALAR VE ROUTING

### Sayfalar

**Tek sayfa var.** Router, sayfa dosyası çokluğu veya sunucu yönlendirmesi yok.

| Dosya | URL | Açıklama |
| --- | --- | --- |
| `index.html` | `/` | Tek ve tek sayfa |
| `robots.txt` | `/robots.txt` | Statik dosya |
| `sitemap.xml` | `/sitemap.xml` | Statik dosya (tek URL içerir: `/`) |
| `og.png` | `/og.png` | Statik görsel |
| `css/style.css` | `/css/style.css` | Statik varlık |
| `js/products.js` | `/js/products.js` | Statik varlık |
| `js/app.js` | `/js/app.js` | Statik varlık |

`scripts/veri-kontrol.js` de teknik olarak `/scripts/veri-kontrol.js`
adresinden servis edilir, ancak Node.js betiğidir; sayfadan çağrılmaz.

### URL durumu (routing yerine geçen mekanizma)

Klasik routing yok; bunun yerine **sorgu dizesiyle (query string) durum
yönetimi** var. `js/app.js` içindeki `urldenOku()` ve `urlYaz()` fonksiyonları
`history.pushState` / `replaceState` kullanıyor, `popstate` dinleniyor.

Tanınan parametreler:

| Parametre | Değer | Örnek |
| --- | --- | --- |
| `reyon` | Reyon id'si | `?reyon=dondurma` |
| `ara` | Arama metni | `?ara=çikolata` |
| `sirala` | `onerilen` · `ucuz` · `pahali` · `birim` · `indirim` · `isim` | `?sirala=birim` |
| `indirim` | `1` (yalnızca indirimliler) | `?indirim=1` |
| `min` / `max` | Fiyat aralığı | `?min=50&max=200` |
| `urun` | Ürün id'si (detay penceresini açar) | `?urun=u065` |

Önemli kısıt: bu mekanizma yalnızca `http:` ve `https:` protokollerinde etkin.
`js/app.js:152`'deki `urlDestekli` kontrolü, `file://` ile açıldığında history
API'sini tamamen devre dışı bırakıyor — sayfa yine çalışıyor, yalnızca adres
güncellenmiyor.

### Ürünler sayfada nasıl render ediliyor

Render tamamen **istemci tarafında**, şablon dizeleri (template literal) ile
`innerHTML`'e yazılarak yapılıyor. Sanal DOM veya şablon motoru yok.

Zincir şöyle: `katalogCiz()` → `suzgectenGecir()` ile listeyi süz/sırala →
her ürün için `kartHtml()` çağır → sonucu tek seferde `#izgara`'ya yaz.

Kart üreten fonksiyon (`js/app.js`):

```js
// Reyon etiketi yalnızca karışık listede bilgi taşır; tek reyon süzüldüğünde gereksiz tekrar.
function kartHtml(u, reyonGoster = durum.reyon === 'hepsi') {
  const yuzde = indirimYuzde(u);
  return `
    <article class="kart" data-id="${u.id}">
      <div class="kart-gorsel-alan">
        ${yuzde ? `<span class="indirim-rozet kart-rozet">%${yuzde} indirim</span>` : ''}
        <img class="kart-gorsel" src="${kacar(u.gorsel)}" alt="${kacar(u.ad)}" loading="lazy" decoding="async" width="400" height="400">
      </div>
      ${reyonGoster ? `<p class="kart-reyon">${kacar(reyonAdi(u.reyon))}</p>` : ''}
      <h3 class="kart-ad" title="${kacar(u.ad)}">${kacar(u.ad)}</h3>
      <div class="kart-fiyat">
        ${etiket(u.fiyat, 's')}
        ${u.eskiFiyat ? `<s class="eski-fiyat">${para(u.eskiFiyat)}</s>` : ''}
      </div>
      ${u._bfYazi ? `<p class="birim-fiyat">${u._bfYazi}</p>` : ''}
      <button class="kart-ac" type="button" data-urun="${u.id}"
              aria-label="${kacar(u.ad)} — ayrıntılar"></button>
    </article>`;
}
```

Izgaraya basan fonksiyon (`js/app.js`):

```js
function katalogCiz() {
  const liste = suzgectenGecir();

  dom.katalogBaslik.textContent = durum.reyon === 'hepsi' ? 'Bütün reyonlar' : reyonAdi(durum.reyon);

  dom.katalogOzet.textContent = durum.arama
    ? `"${durum.arama}" için ${liste.length} ürün bulundu.`
    : `${liste.length} ürün listeleniyor.`;

  const bosMu = liste.length === 0;
  dom.bos.hidden = !bosMu;
  dom.izgara.hidden = bosMu;
  dom.bosAlt.textContent = durum.arama
    ? `"${durum.arama}" tezgâhta yok. Başka bir kelime dene ya da bütün reyonlara dön.`
    : 'Bu reyon şu an boş. Diğer reyonlara göz atabilirsin.';

  // map, geri çağrıya indeksi de geçer — ikinci parametreyi elle veriyoruz
  dom.izgara.innerHTML = liste.map((u) => kartHtml(u)).join('');

  dom.reyonSerit.querySelectorAll('.reyon').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.reyon === durum.reyon));
  });
}
```

Filtre veya sıralama her değiştiğinde ızgaranın **tamamı** yeniden yazılıyor;
kısmi güncelleme yapılmıyor. `index.html` içinde `<div class="izgara" id="izgara"></div>`
boş olarak duruyor, içeriği yalnızca JavaScript dolduruyor.

JavaScript kapalıysa hiçbir ürün görünmez. `index.html`, bu durumu karşılamak
için `<noscript>` bloğuyla bir uyarı gösteriyor ve boş kalacak kontrolleri
(sıralama, reyon şeridi, fırsat bölümü) gizliyor.

---

## 5. BACKEND / SUNUCU TARAFI

**Yok, tamamen statik.**

Aşağıdakilerin hiçbiri depoda bulunamadı:

- API endpoint tanımı, sunucu kodu veya rota dosyası
- `fetch(`, `XMLHttpRequest`, `axios`, `WebSocket` çağrısı — tarama sonucu **sıfır eşleşme**
- `/api/` yolu — **sıfır eşleşme**
- Veritabanı bağlantısı veya ORM izi (`supabase`, `firebase`, `mongodb`,
  `mysql`, `postgres`, `sqlite`, `prisma`) — **sıfır eşleşme**
- Sunucu tarafı dosya uzantısı (`.php`, `.py`, `.rb`, `.go`, `.java`, `.sql`,
  `.db`, `.sqlite`) — **hiç yok**
- Vercel Serverless/Edge Function dizini (`api/`) — **yok**

Site yalnızca statik dosyalardan oluşuyor ve CDN'den olduğu gibi servis ediliyor.
Vercel deploy kayıtlarında build süresi 1 saniyedir; derlenen bir şey yoktur.

Tek "dinamik" davranış, Vercel platformunun kendi sunduğu iki analitik
uç noktasıdır (`/_vercel/insights/*`, `/_vercel/speed-insights/*`). Bunlar
projenin kodu değil, platform hizmetidir; depoda karşılıkları yoktur.

`node scripts/veri-kontrol.js` bir Node.js betiğidir ama **geliştirme aracıdır**,
sunucu değildir: yerelde elle çalıştırılır, hiçbir port dinlemez, siteyle
çalışma anında ilişkisi yoktur.

---

## 6. KİMLİK DOĞRULAMA

**Yok.** Mevcut bir login/auth yapısı bulunmuyor.

`index.html`, `js/app.js` ve `css/style.css` dosyalarında şu terimlerin
hiçbiri geçmiyor: `login`, `logout`, `signin`, `password`, `parola`, `şifre`,
`token`, `auth`, `session`, `jwt`, `cookie`, `localStorage`, `sessionStorage`.

Giriş formu, kullanıcı kavramı, rol, oturum veya yetkilendirme katmanı yok.
Site herkese açık, salt okunur bir katalogdur; sepet, sipariş ve ödeme akışı
da bulunmuyor (bu, `README.md`'de projenin tanımı olarak açıkça belirtilmiş).

Not: `.env.local` içindeki `VERCEL_OIDC_TOKEN`, sitenin ziyaretçi kimlik
doğrulamasıyla **ilgili değildir**; Vercel CLI'nin yerel geliştirme sırasında
kullandığı bir dağıtım aracıdır ve tarayıcıya hiçbir zaman gönderilmez.

---

## 7. DEPLOY

### Yapılandırma dosyaları

| Dosya | Durum |
| --- | --- |
| `vercel.json` | **Yok** |
| `netlify.toml` | **Yok** |
| `.htaccess` | **Yok** |
| `Dockerfile` | **Yok** |
| `docker-compose.yml` | **Yok** |
| `Procfile` | **Yok** |
| `firebase.json` | **Yok** |
| `wrangler.toml` | **Yok** |
| `.github/` (Actions) | **Yok** |
| `.gitlab-ci.yml` | **Yok** |
| `.circleci/` | **Yok** |
| `.travis.yml` | **Yok** |
| `azure-pipelines.yml` | **Yok** |

Yani ayrı bir CI/CD tanım dosyası yok. Deploy, **Vercel'in GitHub
entegrasyonuyla** yürüyor: `main` dalına yapılan her push otomatik olarak
production deploy'u tetikliyor. Bu davranış `README.md`'nin "Yayın" bölümünde
belgelenmiş; yapılandırması Vercel panelinde tutulduğu için depoda dosya
karşılığı yok.

`.vercel/` dizini projeyi Vercel'e bağlayan yerel bağlantı bilgisini tutuyor
(`.gitignore`'da, depoya girmiyor). `project.json` üç anahtar içeriyor:
`projectId`, `orgId`, `projectName` (`projectName` değeri: `meydan-sarkuteri`;
diğer iki değer bu raporda yazılmamıştır).

### Ortam değişkenleri

`.env.example` **yok**. `.env.local` **var** (`.gitignore` ile depo dışında
tutuluyor).

`.env.local` içinde tanımlı değişken adı — **yalnızca ad, değerler bu rapora
yazılmamıştır**:

```
VERCEL_OIDC_TOKEN
```

Bu değişken `vercel link` komutu tarafından otomatik üretilmiştir; uygulama
kodu tarafından okunmuyor (`js/app.js` içinde hiçbir ortam değişkeni
kullanımı yok). Statik sitenin çalışması için gerekli değildir.

---

## 8. ADMIN PANEL İÇİN NOTLAR

### Mevcut yapıdaki kısıtlar

**1. Sunucu yok — bu en temel kısıt.**
Projede hiçbir backend, API veya veritabanı bulunmuyor. Bir admin panelin
yapması gereken en temel iş olan "değişikliği kalıcı olarak yazmak" için
bugün hiçbir mekanizma mevcut değil. Panel eklemek, projeye ilk kez bir
sunucu tarafı getirmek anlamına gelir.

**2. Veri kodun içinde.**
Ürünler `js/products.js` içinde JavaScript kaynak kodu olarak duruyor. Fiyat
değiştirmek, bugünkü yapıda bir kaynak dosyayı düzenleyip commit'lemek ve
yeniden deploy etmek demek. Çalışma anında veri değiştirmenin yolu yok.

**3. Kimlik doğrulama sıfırdan kurulacak.**
Kullanıcı, rol, oturum kavramı yok (bkz. 6. bölüm). Panelin koruması tamamen
yeni bir katman olacak.

**4. Yazma işlemi statik barındırmayla çelişiyor.**
Site derlenmeden CDN'den servis ediliyor ve build süresi 1 saniye. Vercel'de
dosya sistemi salt okunurdur; panelin yazdığı veriyi tutacak harici bir yer
(veritabanı, KV deposu, blob) gerekir.

**5. `package.json` eklemenin bilinen bir yan etkisi var.**
`scripts/veri-kontrol.js` içindeki nota göre depoya `package.json` konduğunda
Vercel projeyi Node projesi sanıp build çalıştırmaya kalkıyor. Panel için
bağımlılık gerekirse bu durumun ayrıca ele alınması gerekir.

**6. Reyon sayaçları elle tutuluyor.**
`REYONLAR[].adet` alanı, ürün sayısının ikinci bir kopyasıdır. Panelden ürün
eklendiğinde/silindiğinde bu alanın da güncellenmesi gerekir, yoksa
`scripts/veri-kontrol.js` hata verir. Panel bu alanı otomatik hesaplamalı.

**7. `id` üretimi çakışmaya açık.**
Kimlikler `u001`, `u002`… biçiminde sıralı; ancak silinen iki kayıt yüzünden
dizide boşluk var (`u139` ve `u258` yok). "En büyük id + 1" mantığı bugün
çalışır ama kırılgandır.

**8. Miktar bilgisi ayrı alan değil.**
Birim fiyat, ürün **adının içinden** ayrıştırılıyor (`js/app.js` içindeki
`olcuCikar()`). Panelde miktar/birim ayrı alan olarak girilirse bu ayrıştırma
tamamen gereksizleşir ve doğruluk artar — bugünkü yöntem katalogun yaklaşık
üçte ikisinde sonuç verebiliyor.

**9. Görseller dışarıya bağlı.**
Görseller perakendeci CDN'lerinden çekiliyor; projede görsel yükleme/saklama
altyapısı yok. Panelden görsel yüklenecekse depolama katmanı da gerekir.

**10. Kazıyıcı betik depoda yok.**
`js/products.js`'in üretildiği yazılım sürüm kontrolünde bulunmuyor. Panel ile
otomatik veri tazeleme arasında bağ kurulacaksa, o betiğin önce depoya alınması
gerekir.

### Veriyi koddan ayırmak gerekiyor mu?

**Evet, gerekiyor.** Sebebi şu: bugün veri, uygulamanın yüklediği bir JavaScript
kaynak dosyası. Bir admin panelin veriyi yazabilmesi için verinin çalışma
anında okunabilir/yazılabilir bir kaynağa taşınması şart.

Bunun için, mevcut yapıya en az müdahaleden en fazlasına doğru üç seçenek var:

**Seçenek A — Veriyi JSON'a taşı, yazmayı Git'e bırak.**
`js/products.js` → `data/products.json` haline gelir, `app.js` bunu `fetch` ile
okur. Panel, GitHub API üzerinden dosyayı commit'ler; push otomatik deploy'u
tetikler. Veritabanı gerekmez, sürüm geçmişi bedava gelir, geri alma kolaydır.
Bedeli: her kayıt bir commit ve bir deploy demektir (~1 sn), anlık değildir.
`file://` ile açma özelliği kaybolur (`fetch` yerel dosyada CORS'a takılır).

**Seçenek B — Harici veri deposu.**
Veri, Vercel Marketplace üzerinden bağlanacak bir Postgres ya da KV deposuna
taşınır. Panel oraya yazar, site oradan okur. Anlık güncelleme sağlar; buna
karşılık projeye backend, bağımlılık ve muhtemelen build adımı girer — projenin
bugünkü en güçlü özelliği olan sıfır bağımlılık ortadan kalkar.

**Seçenek C — Hazır içerik yönetimi (headless CMS).**
Panel yazılmaz, hazır bir CMS'e bağlanılır. En az kod yazılan yol; buna karşılık
dışa bağımlılık ve muhtemelen ücret getirir.

Hangi seçenek seçilirse seçilsin **`scripts/veri-kontrol.js` korunmalıdır.**
Bu betik, 11 Ağustos 2026'da kataloğa iki kampanya afişinin ürün olarak sızması
üzerine yazıldı; yapısal kontrollerin yanında ad makullüğü, görsel şablonu
sapması ve dosyalar arası sayı tutarlılığı gibi anlamsal kontroller de yapıyor.
Veri nereye taşınırsa taşınsın, panelden gelen kayıtların aynı denetimden
geçirilmesi bugünkü güvenceyi korur.

---

*Bu rapor yalnızca depodaki dosyalar okunarak üretilmiştir; hiçbir dosya
değiştirilmemiştir.*
