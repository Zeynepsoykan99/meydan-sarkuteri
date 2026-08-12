-- =====================================================================
-- Meydan Şarküteri — veritabanı şeması (PostgreSQL / Neon)
--
-- Çalıştırma:  npm run migrate
--
-- Buradaki CHECK kısıtları, scripts/veri-kontrol.js'teki kontrollerin
-- veritabanı karşılığıdır. Betik veriyi yazıldıktan SONRA denetliyor;
-- bu kısıtlar geçersiz verinin yazılmasını en baştan engelliyor.
-- İkisi birlikte duruyor: betik anlamsal (ad makullüğü, görsel şablonu,
-- fiyat aykırılığı) kontrolleri yapar, veritabanı yapısal olanları.
--
-- Dosya idempotenttir: iki kez çalıştırılabilir.
--
-- Not: Bu dosya scripts/migrate.js tarafından "-- @@" satırlarından
-- bölünüp ifade ifade çalıştırılır. Ayırıcıyı kaldırmayın; Neon'un HTTP
-- sürücüsü tek çağrıda çok ifadeli SQL kabul etmiyor.
-- =====================================================================

CREATE TABLE IF NOT EXISTS reyonlar (
  id    text PRIMARY KEY,
  ad    text NOT NULL,
  ikon  text,
  sira  int
);

-- @@

-- Ürün id'leri u001 biçiminde ve KORUNUYOR: mevcut bağlantılar
-- (?urun=u065) ve fiyat geçmişi bu id'lere dayanıyor.
--
-- Yeni id için "en büyük + 1" kullanmıyoruz: dizide boşluk var (u139 ve
-- u258 silinmişti), o mantık silinen bir id'yi geri kullanabilir ve
-- fiyat geçmişini yanlış ürüne bağlayabilirdi. Bunun yerine sequence:
-- monoton artar, silinen numaraya asla dönmez.
CREATE SEQUENCE IF NOT EXISTS urun_id_seq AS bigint START WITH 1;

-- @@

CREATE OR REPLACE FUNCTION yeni_urun_id() RETURNS text
LANGUAGE sql VOLATILE AS $$
  -- 3 hane taban; 999'u aşarsa lpad kırpmaz, doğal olarak u1000 olur
  SELECT 'u' || lpad(nextval('urun_id_seq')::text, 3, '0');
$$;

-- @@

CREATE TABLE IF NOT EXISTS urunler (
  id           text PRIMARY KEY DEFAULT yeni_urun_id(),
  ad           text NOT NULL,
  reyon        text NOT NULL REFERENCES reyonlar(id),
  gorsel       text,
  fiyat        numeric(10,2) NOT NULL CHECK (fiyat > 0),
  eski_fiyat   numeric(10,2) CHECK (eski_fiyat IS NULL OR eski_fiyat > 0),
  miktar       numeric CHECK (miktar IS NULL OR miktar > 0),
  birim        text CHECK (birim IS NULL OR birim IN ('kg','L','adet')),
  stokta       boolean NOT NULL DEFAULT true,
  kaynak       text,
  guncellendi  timestamptz NOT NULL DEFAULT now(),

  -- veri-kontrol.js: "miktar ve birim biri dolu biri boş"
  -- Yarım kayıt arayüzde sessizce yanlış birim fiyat üretir.
  CONSTRAINT miktar_birim_birlikte
    CHECK ((miktar IS NULL) = (birim IS NULL)),

  -- veri-kontrol.js: "adet tam sayı değil"
  -- 2,5 poşet çay diye bir şey yok.
  CONSTRAINT adet_tam_sayi
    CHECK (birim IS DISTINCT FROM 'adet' OR miktar = trunc(miktar)),

  -- veri-kontrol.js: "eskiFiyat güncel fiyattan büyük değil"
  -- İndirim, fiyatın düşmüş olması demek.
  CONSTRAINT eski_fiyat_daha_yuksek
    CHECK (eski_fiyat IS NULL OR eski_fiyat > fiyat)
);

-- @@

CREATE INDEX IF NOT EXISTS urunler_reyon_idx ON urunler (reyon);

-- @@

CREATE INDEX IF NOT EXISTS urunler_guncellendi_idx ON urunler (guncellendi DESC);

-- @@

CREATE TABLE IF NOT EXISTS fiyat_gecmisi (
  id       bigserial PRIMARY KEY,
  urun_id  text REFERENCES urunler(id) ON DELETE CASCADE,
  eski     numeric(10,2),
  yeni     numeric(10,2),
  zaman    timestamptz DEFAULT now()
);

-- @@

CREATE INDEX IF NOT EXISTS fiyat_gecmisi_urun_idx ON fiyat_gecmisi (urun_id, zaman DESC);

-- @@

-- Fiyat değişince geçmişe kayıt at ve guncellendi damgasını tazele.
-- BEFORE UPDATE: NEW.guncellendi'yi aynı satırda değiştirebilmek için.
CREATE OR REPLACE FUNCTION fiyat_degisimini_kaydet() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.fiyat IS DISTINCT FROM OLD.fiyat THEN
    INSERT INTO fiyat_gecmisi (urun_id, eski, yeni)
    VALUES (OLD.id, OLD.fiyat, NEW.fiyat);
    NEW.guncellendi := now();
  END IF;
  RETURN NEW;
END;
$$;

-- @@

DROP TRIGGER IF EXISTS urunler_fiyat_gecmisi ON urunler;

-- @@

CREATE TRIGGER urunler_fiyat_gecmisi
  BEFORE UPDATE OF fiyat ON urunler
  FOR EACH ROW EXECUTE FUNCTION fiyat_degisimini_kaydet();

-- @@

-- Sequence'i mevcut en büyük id'nin üstüne al. Boş tabloda 1'den başlar.
-- is_called=true: bir sonraki nextval() bu değerin BİR FAZLASINI verir,
-- yani var olan bir id'yi asla tekrar üretmez.
SELECT setval(
  'urun_id_seq',
  GREATEST(
    (SELECT COALESCE(MAX(NULLIF(regexp_replace(id, '\D', '', 'g'), '')::bigint), 0) FROM urunler),
    1
  ),
  true
);
