# Next.js 16.2 + Tailwind 4 Geçişi — Aşama 1 & Aşama 2

**Dal:** `nextjs` · **Temel:** `b996a1a` (main) · **`origin/nextjs`'e PUSH EDİLDİ**

Mevcut site canlıda kalıyor, ona dokunulmuyor. Next.js `nextjs/` alt dizininde.
`main` dalı hiç değişmedi (`b996a1a`).

| Adım | Durum |
| --- | --- |
| 1. Kurulum | **bitti** — next 16.2.12, React 19.2.4, Tailwind 4.3.3 |
| 2. Doküman | **bitti** — App Router, PPR, Cache Components |
| 3. Tema | **bitti** — 30 token; ham hex ve Tailwind varsayılan paleti sıfır |
| 4. Veri katmanı | **bitti** — lib/{tipler,veritabani,katalog,dukkan,bicim,saat,auth,yonetici} |
| 5. Katalog & SSR | **bitti** — sunucu render + istemci adası |
| 6. Ürün detayı | **bitti** — 470 statik yol; olmayan id 404 (geçici çözümle, aşağıda) |
| 7. Dükkân bilgileri | **bitti** — saat mantığı taşındı, durum akışla |
| 8. Kimlik doğrulama | **bitti** — scrypt, HttpOnly çerez, 15dk/5 deneme hız sınırı |
| 9. Yönetici API uçları | **bitti** — durum, urunler (no-store), urun (PATCH) |
| 10. Giriş & Panel | **bitti** — /giris, /panel (mobil öncelikli, hızlı onay, düzenleme modalı) |
| 11. Kapı afişi & QR | **bitti** — /afis (A4 dikey baskı dostu, qr.svg, robots: noindex) |
| 12. Sınamalar | **bitti** — 113 sınama, 3 dosya, %100 geçiyor |
| 13. Güvenlik belgesi | **bitti** — secure çerez koşulu, X-Forwarded-For gerekçesi kodda |
| 14. Derleme kararlılığı | **bitti** — derleme artık DB'ye hiç dokunmuyor (aşağıda) |
| 15. Ürün ekleme/silme | **bitti** — POST + DELETE, panelde modallar, 21 sınama |
| 16. Sağlık ucu | **bitti** — `/api/saglik`, 21 sınama |
| 17. Hata sınırları | **bitti** — kök + vitrin + panel |
| 18. PWA & robots | **bitti** — manifest, 2 ikon, `robots.ts` |
| 19. Silme sertleştirme | **bitti** — DELETE kapıları, tek giriş noktası, geçmiş sayısı |
| 20. Önbellek tazeleme | **bitti** — revalidatePath uçlara taşındı, actions.ts silindi |
| 21. PWA ikonları | **bitti** — gerçek PNG, 192 ve 512 |
| 22. Vercel geçişi | **hazır, YAYINLANMADI** — `main`'e birleşince canlıya çıkar |

## Kesin kurallar
- next **16.2**, 16.3'e geçme. TypeScript. App Router. Pages Router YOK.
- Şema DEĞİŞMEYECEK. Aynı Neon, aynı tablolar.
- Ham hex/px YAZMA — her değer temadan. Tailwind varsayılan paleti YASAK.
- Yazı tipleri next/font ile.
- Önbellek: Next 16 Cache Components (`use cache` + `cacheLife`), dinamik uçlarda `connection()`.

## Sınamalar — 191 + ~30 sınama, 6 dosya

| Dosya | Sınama | Ne bakıyor |
| --- | --- | --- |
| `tests/dukkan.mjs` | 47 | Saat mantığı, ham HTML'de 470 ürün, 320/375/1280px, kontrast |
| `tests/asama2.mjs` | 42 | Sayfa erişimi, **yetkisiz** API reddi, /urun durum kodları |
| `tests/asama2-yetkili.mjs` | 46 | **Yetkili** taraf: gerçek oturumla yazma, doğrulama, hız sınırı |
| `tests/asama3-urun-yonetimi.mjs` | 35 | Ürün ekleme/silme: 401, 400 doğrulamaları, 201, 404, 200 |
| `tests/saglik.mjs` | 21 | `/api/saglik`, PWA manifest, `.html` yönlendirmeleri, güvenlik başlıkları |
| `tests/panel.mjs` | ~30 | **Tarayıcı sınaması**: art arda silme/ekleme/düzenleme, kapanma yolları, ağ hatası, oturum bitişi |

Ayrıca `tests/agirlik.mjs` — sınama değil, ölçüm raporu. Varsayılanı :3000
olduğu için **`ADRES=http://localhost:3001` vererek çalıştır**, yoksa dev
sunucusunu ölçer ve rakamlar (devtools paketleri yüzünden) iki katı çıkar.

Çalıştırma: `npm run build` → `npm start -- -p 3001` → altı dosyayı da koş.
`panel.mjs` ek olarak Playwright ve Chrome gerektiriyor (bkz. K turu).
Son tam tur (HTTP sınamaları): 20 Ağustos 2026, **191/191 geçti**.

`asama2-yetkili.mjs` ve `asama3-urun-yonetimi.mjs` CANLI VERİTABANINA YAZIYOR.
`asama3` eklediği ürünü ve geçici hesabı `finally` içinde siliyor.
`asama2-yetkili`'nin güvenlik ağı daha geniş:
ürünlerin kopyasını alır, geçici bir yönetici hesabı açar, sonunda kopyayı
geri yükler, geri yüklemenin **birebir** olduğunu satır satır doğrular,
hesabı ve ürettiği tüm kayıtları siler. `meydan` hesabına dokunmaz.
Son durum denetimi (20 Ağustos 2026): 470 ürün / kaynak='dukkan' **1**
(u008, panelden düzenlendiği için) / fiyat_gecmisi 0 / miktar IS NULL 88 /
hesaplar: `meydan`, `zeynep`.

## Yetkili sınamaların bulduğu KRİTİK hata (düzeltildi)

`lib/yonetici.ts` içindeki `yamaDogrula`, taşıma sırasında bozulmuştu:

```ts
// bozuk hâli
let yeniEski = (mevcut.eski_fiyat ?? mevcut.eskiFiyat) === null ? null : Number(...)
```

`eski_fiyat` null olduğunda `null ?? undefined` → `undefined`, `undefined === null`
false, `Number(undefined)` → **NaN**. NaN sonra "eskiFiyat güncel fiyattan büyük
olmalı" kontrolüne düşüyor ve **indirimsiz her ürünün fiyat güncellemesi 400 ile
reddediliyordu**. 470 üründen **433'ü** panelden düzenlenemez durumdaydı — yani
panelin asıl işi bozuktu. Kökteki `api/_lib/urun.js` doğruydu; hata yalnızca
Next taşımasındaydı. Düzeltildi, sınamayla korunuyor.

## Derleme kararsızlığı — teşhis ve durum

**Belirti:** `npm run build` bazen `USE_CACHE_TIMEOUT` ile çöküyordu:
`Filling a cache during prerender timed out ... src/lib/katalog.ts:39`.

**Mekanizma:** `node_modules/next/dist/server/use-cache/use-cache-wrapper.js:520`
— bir `use cache` girdisini doldurmak için **sabit 50 saniye** bütçe var.
Hata metnindeki "muhtemelen isteğe özgü veri kullandınız" ifadesi
`UseCacheTimeoutError` sınıfının içine gömülü genel bir tahmin; nedeni ölçmüyor.
`katalogGetir()` isteğe özgü hiçbir şeye dokunmuyor (sıfır argüman, closure yok,
cookies/headers/params yok). Sorun süreydi.

**Ölçümler:**

| Durum | Sayfa üretimi |
| --- | --- |
| Sıcak DB | **4.7 – 6.2 sn** |
| Uzun boşta kalma sonrası ilk derleme | **51 sn** (eşik 50 sn) |
| Sıcak DB, 15 eşzamanlı tam katalog sorgusu | en yavaş 383 – 506 ms |

Neon boştayken hesaplama birimini askıya alıyor; uyanma maliyeti doğrudan
önbellek bütçesinin içinde ödeniyordu ve ilk derleme eşiğin bir saniye
altında/üstünde gidip geliyordu.

**Yapılan:** `scripts/db-isit.mjs`, `prebuild` olarak çalışıyor ve DB'yi
derlemeden önce uyandırıyor. Aynı sorgu ürün kimlik listesini de üretiyor
(aşağıya bakınız).

**KAPANDI — çözüm: derleme veritabanına hiç dokunmuyor.** Isıtma eklendikten
SONRA da yavaş üretimler görülmüştü (51, 50, 49 sn). Üç değerin tam 50 sn
eşiğinin dibinde kümelenmesi belirleyiciydi: gerçek bir ağ yavaşlığı olsaydı
süreler rastgele dağılırdı. Yani veritabanı yavaş değildi — bir `use cache`
doldurma işi askıda kalıyor, 50. saniyede giyotine çarpıyor, derleme çoğu
zaman toparlanıyor, toparlayamayınca `USE_CACHE_TIMEOUT` ile çöküyordu.

Askıda kalmanın kökü aranmadı; onun yerine derleme o yoldan tamamen çıkarıldı.
`src/lib/katalog.ts` artık `NEXT_PHASE === "phase-production-build"` iken
veritabanına gitmiyor, `prebuild`'in ürettiği `src/katalog-anlik.json`'u
okuyor (disk okuması ~1 ms, 50 sn bütçesini zorlaması imkânsız). Çalışma
zamanı hiç değişmedi: canlı sorgu, düşerse aynı dosyaya yedeğe düşme.

**Ölçüt doğrulandı (20 Ağustos 2026): 5 ardışık derleme, üretim süreleri
4.6 / 4.0 / 4.0 / 4.0 / 4.3 sn — hepsi 10 sn eşiğinin çok altında, 40 sn'ye
yaklaşan tek koşu yok.**

Ölçüm: sayfa üretimi **~4.2 sn** / 487 sayfa, derleme
veritabanı durumundan bağımsız. `db-isit.mjs` duruyor — artık ısıtmak için
değil, ürün kimlik listesini ve `dukkan.json` kopyasını ürettiği için.

Bu, ILERLEME'nin önceki turunda "kalıcı çözüm büyük ihtimalle prerender'ı
derleme anındaki anlık görüntüden beslemek" diye tarif edilen adımın ta kendisi.

## Olmayan ürün id'si — geçici çözüm

**Sorun:** `/urun/[id]` `generateStaticParams` kullandığı için SSG sayılıyor.
O rotada `notFound()` atılınca Next önbellek girdisine `revalidate: 0` veriyor,
ama aynı kod yolu bunu kabul etmiyor:
`build/templates/app-page.js:1002 → "Invalid revalidate configuration provided: 0 < 1"`.
Sonuç: ziyaretçiye ve arama motoruna 404 yerine **500**.

**Denenenler:** `dynamicParams = false` (belgelenen çözüm) — Turbopack reddediyor,
`cacheComponents` ile uyumsuz. 16.2 içinde yama — 16.2.12 dalın sonuncusu.
16.3'e geçmek proje kuralıyla yasak.

**Geçici çözüm:** `src/proxy.ts` isteği sayfaya varmadan kesiyor; kimlik geçerli
listede yoksa Next'in normal 404 akışına yazılıyor. Liste
(`src/urun-kimlikleri.json`, 470 kimlik) derleme öncesi `db-isit.mjs` tarafından
üretiliyor ve depoya giriyor.

**Bedeli:**
1. Liste bir anlık görüntü — derlemeden SONRA eklenen ürün, sonraki derlemeye
   kadar 404 döner (eskiden 500 dönüyordu, gerileme değil).
2. Derlemeden SONRA SİLİNEN ürün listede kalır; o adreste 500 kusuru geri gelir.
   Ürün silmek çok seyrek; silindiğinde yeniden derlemek gerekir.
3. Her `/urun/*` isteği 470 elemanlı bir Set aramasından geçiyor — ölçülemez.

Next'te kusur düzelince `src/proxy.ts` ve `db-isit.mjs`'teki liste adımı silinip
`notFound()` yalnız bırakılabilir.

## Tema — ham hex sıfır

7 ham hex temaya taşındı. Yeni token'lar: `yesil-vurgu`, `vitrin-metin`,
`sari-sis`, `sari-rozet`, `sari-metin`, `mavi-sis`, `mavi-metin`.
`#E4F5E9` zaten `--color-yesil-sis`'in kopyasıydı, doğrudan ona bağlandı.

Ayrıca iki ölü `bg-white` sınıfı bulundu (`/afis`): `--color-*: initial` varsayılan
paleti sildiği için o sınıflar hiçbir şey üretmiyordu — `bg-beyaz` yapıldı.

Tarama ile doğrulandı: `src/` altında `globals.css` dışında ham hex yalnızca
tek bir yerde — `layout.tsx`'teki `viewport.themeColor`. Meta etiketi CSS
değişkeni okuyamıyor; değer `--color-kirmizi` ile aynı olmak zorunda ve bu
kodda not düşüldü. `public/manifest.json` de aynı rengi taşıyor. Tema kırmızısı
değişirse bu iki dosya elle güncellenmeli. **Tailwind varsayılan palet sınıfı
yok.**

## Derleme Özeti

487 sayfa (470 ürün + ana + /afis + /giris + /panel + /robots.txt +
/sitemap.xml + 404 + kabuk), PPR, revalidate 1m / expire 1h.
Ayrıca `ƒ Proxy (Middleware)` ve 8 dinamik API ucu.

- Sayfa üretimi: **5.1 sn** — artık veritabanı durumundan bağımsız
- Sayfa ağırlığı (üretim, 1280px): **2359 KB / 59 istek**; görseller 1049 KB,
  betikler 527 KB, RSC 21 KB

## Aşama 3 — ürün ekleme ve silme

Panelin eksik yarısı tamamlandı: sahibi artık kataloğa ürün ekleyip
silebiliyor.

- `POST /api/yonetici/urun` — `yeniUrunDogrula()` ile alan alan doğrulama:
  ad 2–200 karakter, reyon veritabanındaki reyonlardan biri, fiyat > 0 ve en
  fazla 2 ondalık, eski fiyat > güncel fiyat, miktar ile birim birlikte,
  `birim = "adet"` ise miktar tam sayı, görsel http(s) ya da yerel yol.
  Kaynak `'dukkan'` yazılıyor — Migros'tan gelen veriden ayırt edilsin diye.
- `DELETE /api/yonetici/urun` — id gövdeden ya da sorgu dizesinden; yoksa 404.
- Panelde `UrunEkleModal`, `UrunSilModal`, satır içi çöp kutusu düğmesi ve
  düzenleme modalında "Sil"; başarı bildirimi (toast).
- Her iki uç da `[DENETİM]` satırı basıyor: kim, hangi ürün, hangi alanlar.

Silmenin bilinen bedeli: derlemeden sonra silinen ürünün adresi
`src/urun-kimlikleri.json`'da kalıyor ve orada 500 kusuru geri geliyor
(bkz. "Olmayan ürün id'si"). Ürün silmek seyrek; silince yeniden derlemek gerek.

## Yayın durumu — HENÜZ CANLIDA DEĞİL

`vercel.json` `nextjs/` alt dizinini derleyecek şekilde değiştirildi,
`.vercelignore` eski vanilla dosyaları yayından çıkarıyor, `.html` adresleri
için 308 yönlendirmeler eklendi. **Ama bunların hiçbiri canlıya çıkmadı.**

Doğrulandı (20 Ağustos 2026, canlı adres):

    /               → eski vanilla site (ham HTML'de 0 ürün kartı)
    /api/katalog    → 200  (eski serverless uç hâlâ ayakta)
    /api/saglik     → 404  (yeni Next ucu yayında yok)
    /urun/u001      → 404  (statik ürün adresleri yayında yok)

Sebep: iş `nextjs` dalında, Vercel `main`'i yayınlıyor. Geçiş, `nextjs`
`main`'e birleştirildiğinde olur. Birleştirmeden önce bakılacaklar:
`DATABASE_URL` ve oturum sırrı Vercel proje ortamında tanımlı mı, Vercel
panelindeki Root Directory ayarı `vercel.json`'la çelişiyor mu.

## Açık kararlar (kod hazır, karar bekliyor)

1. ~~**`src/app/panel/actions.ts` kullanılmıyor.**~~ **KAPANDI** — dosya
   silindi, `revalidatePath` çağrıları PATCH/POST/DELETE uçlarına taşındı.
   Eski not:  İçindeki `urunEkleAction` /
   `urunSilAction` sunucu eylemleri, POST/DELETE uçlarındaki mantığın birebir
   ikizi; panel arayüzü `fetch` ile API uçlarını çağırıyor, eylemleri hiçbir
   yerden çağırmıyor. İki seçenek: dosyayı silmek, ya da paneli eylemlere
   geçirip API uçlarını yalnız dış tüketiciye bırakmak. Şu hâliyle aynı
   doğrulama iki yerde duruyor — biri düzelince öteki geride kalır.
2. **İndirim rozetinin sonsuz nabız animasyonu** (`.kart-rozet`,
   `rozet-nabiz 2s infinite`). İndirimli her kartta durmadan dönüyor;
   telefonda pil ve GPU maliyeti sürekli. `prefers-reduced-motion` saygılı.
   Bir kez oynayıp durması ya da tamamen kaldırılması düşünülebilir.
3. ~~**`npm run lint` temiz değil**~~: **KAPANDI** — `any` kullanımları güvenli tiplerle değiştirildi (`Yama`, `Record<string, unknown>`), React hook adlandırmaları (`useKatalogDurumu`), effect içi senkron `setState` çağrıları ve SSG `Date.now` kuralları düzeltildi. Artık **0 hata, 0 uyarı ile %100 temiz**.

## Sıradaki tur

- Görseller 1049 KB ile sayfanın en ağır parçası; `next/image` kullanılmıyor
  (karar gerekçesi `nextjs/README.md`'de). Uzak CDN 400×400 veriyor.
- `next/image` yerine daha ucuz bir adım: kart görsellerine `loading="lazy"`
  ve boyut ipucu — ilk ekran dışındaki 400+ görsel indirilmesin.


## J turu — silme sertleştirme, önbellek, ikonlar (20 Ağustos 2026)

**DELETE ucu diğerleriyle hizalandı.** Content-Type `application/json` kapısı
eklendi (415) ve id artık YALNIZCA gövdeden okunuyor. Sorgu dizesi desteği
(`?id=u005`) kaldırıldı: silme adresi bağlantıya, tarayıcı geçmişine, sunucu
günlüğüne ve Referer başlığına düşebiliyordu, üstelik gövdesiz bir istek de
silebildiği için Content-Type kapısını anlamsızlaştırıyordu.

**Silme tek giriş noktasına indi.** Satır içindeki çöp kutusu düğmesi
kaldırıldı; silme yalnızca düzenleme modalından yapılıyor. Onay metni artık
ürünün ADINI ve birlikte silinecek fiyat geçmişi sayısını söylüyor
("… 3 fiyat değişikliği kaydı da silinecek"). Sayı `/api/yonetici/urunler`
yanıtındaki yeni `fiyatGecmisiSayisi` alanından geliyor; DELETE yanıtı da
`silinenFiyatGecmisi` bildiriyor ve denetim günlüğüne yazıyor.

**Önbellek tazeleme gerçekten çalışıyor.** `revalidatePath("/")` ve
`revalidatePath("/panel")` PATCH, POST ve DELETE uçlarına taşındı. Önceden bu
çağrılar yalnızca hiç çağrılmayan `actions.ts` içindeydi, yani tazeleme HİÇ
çalışmıyordu ve panelden yapılan değişiklik ziyaretçiye bir dakikaya kadar
gecikmeyle yansıyordu.

**PWA ikonları düzeltildi.** Dosyalar `.png` uzantılıydı ama içerik JPEG'di ve
ikisi de 1024×1024'tü; manifest ise PNG/192/512 diyordu. Mevcut çizim korunarak
gerçek PNG olarak 192 ve 512'de yeniden üretildi. Sınama artık PNG imzasını ve
IHDR boyutlarını manifestle karşılaştırıyor.

**Panel damgası artık doğru dosyadan okunuyor.** "Yedek şu tarihli" bilgisi
`data/products.json`'dan geliyordu — ama o dosyaya hiçbir yerden YAZILMIYOR,
yani damga yerinde sayıyor ve esnafa olmayan bir tazelik bildiriyordu. Artık
gerçekten her derlemede tazelenen `src/katalog-anlik.json`'dan okunuyor.

### Açık: anlık görüntülerin bayatlaması

Ürün eklenip silindiğinde `src/katalog-anlik.json` ve `src/urun-kimlikleri.json`
bir sonraki derlemeye kadar eskiyor. Sonuçları: silinen ürünün adresi proxy'den
geçip 500 veriyor; veritabanı düşerse yedek görünümde silinmiş ürün görünüyor.
Panelde uyarı gösterilsin mi, yoksa kabul edilip belgelensin mi — karar bekliyor.


## K turu — panel modal kilitleme düzeltmesi (26 Ağustos 2026)

**Canlıda bulunan KRİTİK hata:** Bir ürün silindikten sonra ikincisini silmeye
kalkınca onay modalı "Siliniyor..." yazıp kilitli açılıyordu, hiç istek
göndermiyor ve Vazgeç/Esc da çalışmadığı için kullanıcı sayfayı yenilemeden
çıkamıyordu.

**Köken:** `UrunSilModal.handleSil` içinde `setIslemde(false)` yalnızca başarısız
daldaydı. Başarılı silmede bayrak `true` kalıyordu. Bileşen de PanelArayuzu'nda
koşulsuz ve key'siz monte edildiği için sökülmüyor, bayat durum ikinci açılışa
taşınıyordu.

**Düzeltme (3 dosya):**

1. **`UrunSilModal.tsx`**: `handleSil` `try/finally` ile sarıldı — `setIslemde(false)`
   her yolda (başarı, başarısızlık, fırlatma) çalışıyor. ESC ve Vazgeç'ten
   `!islemde` koşulu kaldırıldı: yıkıcı eylem devre dışı kalıyor ama çıkış
   yolu hiçbir zaman kilitlemiyor. ✕ (Kapat) düğmesi eklendi — üçüncü çıkış yolu.

2. **`PanelArayuzu.tsx`**: `UrunEkleModal` ve `UrunSilModal` artık **koşullu monte**
   ediliyor (`{acik && <.../>}`). Her açılış taze React örneği veriyor.
   `UrunSilModal`'a `key={silinecekUrun.id}` eklendi. `UrunDuzenleModal` bunu
   baştan doğru yapıyordu; bu iki modal ondan geri kalmıştı.

3. **`tests/panel.mjs`** (YENİ): Playwright ile 8 bölümlü tarayıcı sınaması.
   Art arda 2 silme, 2 ekleme, 2 düzenleme, 2 hızlı onay, 3 kapanma yolu
   (Vazgeç/Esc/✕), ağ hatası durumu, oturum bitişi. Canlı veritabanına yazıyor;
   geçici hesap ve ürünlerini `finally` içinde siliyor. Çalıştırma:
   `npm i --no-save playwright-core && node --experimental-strip-types tests/panel.mjs`
   (Chrome yolu `CHROME_YOLU` ile verilebilir).

**Bu hatanın 250 sınamanın hiçbirinde yakalanamamasının sebebi:** Mevcut
sınamaların tamamı ya saf HTTP+DB (asama2-yetkili, asama3), ya da yalnızca
vitrini gezen tarayıcı sınamasıydı (dukkan, sayfalama). Panel arayüzünü
tarayıcıda açıp React bileşen durumunu ölçen tek bir sınama yoktu.

Derleme doğrulandı: 486 sayfa, 5.8 sn, hata yok.
