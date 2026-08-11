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
index.html        Sayfa iskeleti
css/style.css     Tüm stiller (tek dosya, CSS değişkenleriyle)
js/products.js    Ürün kataloğu — 472 ürün, 13 reyon (otomatik üretildi)
js/app.js         Filtre, arama ve sıralama mantığı
```

## Neler var

- **Reyon filtresi** — 13 reyon, üstteki kaydırılabilir şeritten seçilir.
- **Arama** — Türkçe karakter duyarsız; "cıkolata" yazsan da "Çikolata"yı bulur.
  `/` tuşu arama kutusuna odaklanır.
- **Sıralama** — reyon sırası, artan/azalan fiyat, en çok indirim, A–Z.
- **Günün etiketi** — kataloğun en yüksek indirimli ürününden otomatik üretilir.
- **Düşen etiketler** — indirimli ürünlerin yatay rayı. Katalogda hiç indirim
  kalmazsa bu bölüm de ona giden düğme de gizlenir.
- **Paylaşılabilir bağlantı** — seçili reyon, arama ve sıralama adres çubuğuna
  yazılır (`?reyon=dondurma&ara=çubuk&sirala=ucuz`), geri tuşu önceki filtreye
  döner. `file://` ile açıldığında tarayıcı buna izin vermez; filtreler yine
  çalışır, yalnızca adres güncellenmez.
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
| a101.com.tr/kapida | 223 |
| migros.com.tr (Sanal Market) | 249 |

Her ürünün `kaynak` alanı hangi katalogdan geldiğini tutar. Aynı ada sahip ürünler
tekilleştirildi (24 Migros kaydı bu yüzden alınmadı). Görseller ilgili markanın
CDN'inden çekilir, projeye kopyalanmaz — yani o CDN'ler bağlantıyı değiştirirse
görsel düşer. Bu durumda kart boş kalmaz, yerine etiket simgesi konur.

İndirimli fiyatlar yalnızca A101 tarafında var. Migros'ta ürünlerin yanında görünen
"Money ile" fiyatı bir sadakat kartı fiyatı, herkese açık bir indirim değil — bu yüzden
indirim olarak alınmadı, raf fiyatı kullanıldı.

Fiyatlar o günün anlık görüntüsüdür; kendiliğinden güncellenmez.

Site bir katalogdur: ürünleri ve fiyatları gösterir, sipariş almaz.
