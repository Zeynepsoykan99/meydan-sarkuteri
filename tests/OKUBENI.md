# Sınamalar

Tarayıcı sınamaları. Deploy'a girmez (`tests/` `.vercelignore`'da).

## Gereksinim

`playwright-core` ve sistemde kurulu bir Chrome. Projeye bağımlılık
eklemedik: kurulu değilse sınamalar çalışmaz, site etkilenmez.

```
npm i --no-save playwright-core
```

## Çalıştırma

Önce yerel sunucu ayakta olmalı:

```
npm run dev            # vercel dev, :3000
node tests/dukkan.mjs  # 74 sınama
```

Değişkenler: `ADRES` (varsayılan `http://localhost:3000`),
`CHROME_YOLU` (varsayılan Windows'taki Chrome).

## Ne sınıyor

`tests/dukkan.mjs` — dükkân bilgileri bölümü:

- **Açık/kapalı hesabı.** Sahte tarihlerle sekiz an; gece yarısını aşan
  saatler (22:00–02:00); cihazın saat dilimi New York'ken bile Türkiye
  saatinin kullanılması; saat verisi eksik/bozukken göstergenin hiç
  çıkmaması.
- **Bağlantı biçimleri.** `tel:` ve `wa.me`; `0555…` numarasının ülke
  koduna çevrilmesi; geçersiz numarada bağlantı üretilmemesi.
- **Dayanıklılık.** Dosya yokken, JSON bozukken, alanlar tek tek boşken
  sayfanın 470 kartla normal çalışması ve ilgili parçanın gizlenmesi.
- **`dolduruldu` bayrağı.** `false` iken bölümün ve şeridin hiç
  çıkmaması, başlık/altbilginin sabit metinde kalması, konsola tek satır
  uyarı, sayfada "DOLDURULACAK" sızıntısı olmaması.
- **`veri-kontrol.js` denetimi.** Bayrak açıkken kalıntı, boş telefon ve
  boş adres yakalanıyor mu; doğru doldurulmuş dosya geçiyor mu.
- **Ölçüler.** 320/375/1280px'te taşma yok, bağlantılar ≥44px, kontrast
  WCAG AA (hesap sayfada yapılıyor, göz kararı değil).

`tests/dukkan-goruntu.mjs` — belgeleme için ekran görüntüsü üretir
(`.gorsel/telefon-dukkan-*.png`). Gerçekçi örnek veriyle çalışır ve
`data/dukkan.json`'ı bayt bayt geri koyar.

Her iki betik de dosyayı geçici olarak değiştirir; `finally` içinde
özgün hâline döndürür ve döndürdüğünü doğrular.
