# Meydan Şarküteri

Mahalle marketi için tek sayfalık **ürün kataloğu**. Ürünler ve etiket fiyatları
gösterilir; sepet, sipariş ya da ödeme yoktur. Sadece frontend.

**Canlı:** <https://meydan-sarkuteri.vercel.app>

## Çalıştırma

`index.html` dosyasını doğrudan tarayıcıda açabilirsin. Yerel sunucuyla denemek için:

```
npx serve .
```

Bağımlılık, paket yöneticisi ve build adımı yok — depoyu klonlayıp açman yeterli.

## Yayın

Vercel'de, `main` dalına bağlı. Dosyalar olduğu gibi CDN'den servis edilir;
derlenecek bir şey ve çalışan sunucu kodu yok. `main`'e her push production'a
otomatik çıkar. Elle deploy gerekirse:

```
vercel --prod
```

## Dosyalar

```
index.html               Sayfa iskeleti
css/style.css            Tüm stiller (tek dosya, CSS değişkenleriyle)
js/products.js           Ürün kataloğu — 470 ürün, 13 reyon (otomatik üretildi)
js/app.js                Filtre, arama, sıralama, birim fiyat, detay penceresi
scripts/veri-kontrol.js  Veri doğrulama (aşağıya bak)
og.png                   Paylaşım görseli, siteden üretilmiş 1200×630
```

## Neler var

- **Reyon filtresi** — 13 reyon, üstteki kaydırılabilir şeritten seçilir.
- **Arama** — Türkçe karakter duyarsız; "cıkolata" yazsan da "Çikolata"yı bulur.
  `/` tuşu arama kutusuna odaklanır.
- **Sıralama** — reyon sırası, artan/azalan fiyat, birim fiyat, en çok indirim, A–Z.
- **Birim fiyat** — ₺/kg, ₺/L ya da ₺/adet, ürün adındaki miktardan hesaplanır
  (`4x80 Ml`, `1,25 L`, `32'li` gibi kalıplar dahil). Katalogun yaklaşık üçte
  ikisinde çıkıyor; çıkmayanlarda satır hiç basılmaz. 1 kg / 1 L ambalajda da
  basılmaz, çünkü birim fiyat etiket fiyatının aynısı olur.
  Sıralamada ₺/adet ayrı grupta tutulur: ₺1,60/adet ile ₺214/kg kıyaslanabilir
  şeyler değil, tek listede sıralanınca ucuz görünen adetliler başa geçiyordu.
- **Ürün ayrıntısı** — karta tıklayınca açılır (native `<dialog>`: Esc ve odak
  tuzağı tarayıcıdan gelir). Büyük görsel, birim fiyat, önceki fiyat ve verinin
  hangi katalogdan geldiği. Adres çubuğuna `?urun=u001` yazılır, bağlantı
  paylaşılabilir, geri tuşu pencereyi kapatır.
- **Filtreler** — "Sadece indirimliler" düğmesi ve fiyat aralığı kutuları.
- **Günün etiketi** — kataloğun en yüksek indirimli ürününden otomatik üretilir.
- **Düşen etiketler** — indirimli ürünlerin yatay rayı. Katalogda hiç indirim
  kalmazsa bu bölüm de ona giden düğme de gizlenir.
- **Veri tarihi rozeti** — vitrinde fiyatların hangi güne ait olduğu yazar.
  Metin `VERI_TARIHI`'nden üretilir, elle yazılmaz ki eskimesin.
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
ve `js/products.js` içinde statik olarak durur:

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
node scripts/veri-kontrol.js
```

`js/products.js` her yeniden üretildiğinde çalıştır. Hata varsa 1 ile çıkar.

Yapısal kontrollerin (sayaçlar, tekrarlı id/ad, geçersiz fiyat, eksik görsel,
`eskiFiyat > fiyat`) yanında **anlamsal** kontroller de yapar — yukarıdaki iki
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
