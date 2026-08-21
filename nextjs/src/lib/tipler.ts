/* Veri biçimleri. Alan adları veritabanındaki snake_case'ten camelCase'e
   çevriliyor (eski_fiyat → eskiFiyat); dönüşüm lib/katalog.ts'te. */

export type Urun = {
  id: string;
  ad: string;
  reyon: string;
  gorsel: string | null;
  fiyat: number;
  eskiFiyat: number | null;
  kaynak: string | null;
  miktar: number | null;
  birim: string | null;
  stokta: boolean;
  /** panel-özel, bkz. yukarıdaki not */
  fiyatGecmisiSayisi?: number;
};

/* PANEL-ÖZEL, opsiyonel: /api/yonetici/urunler bu alanı dolduruyor.
   Silme onayında "kaç fiyat kaydı da gidecek" diyebilmek için. Ziyaretçi
   tarafındaki yollarda hiç set edilmiyor, o yüzden opsiyonel. */
export type Reyon = {
  id: string;
  ad: string;
  ikon: string | null;
};

/* İSTEMCİYE GİDEN hafif ürün. Süzme ve kart çizimi için gereken alanlar
   yalnızca. `kaynak` istemcide hiç kullanılmıyordu; `miktar`/`birim` ise
   yalnızca birim fiyat hesabı içindi — o hesap artık sunucuda yapılıp
   sonucu (bfYazi/bfDeger/bfGrup) geçiriliyor. Böylece hem RSC yükü
   küçülüyor hem de 470 ürün için regex ayrıştırma istemcide tekrarlanmıyor.
   Kökteki js/app.js de aynı şeyi yapıyordu (_bfYazi, _bf, _bfGrup). */
export type KartVerisi = {
  id: string;
  ad: string;
  reyon: string;
  gorsel: string | null;
  fiyat: number;
  eskiFiyat: number | null;
  stokta: boolean;
  /** birim fiyat yazısı, ör. "₺129,90/kg" — boşsa gösterilmiyor */
  bfYazi: string;
  /** sıralama için sayısal birim fiyat; yoksa Infinity */
  bfDeger: number;
  /** 0 ağırlık/hacim, 1 adet, 2 birimsiz — kıyaslanabilirlik grubu */
  bfGrup: number;
};

export type Katalog = {
  guncellendi: string | null;
  reyonlar: Reyon[];
  urunler: Urun[];
  /** true ise veri canlı veritabanından değil, derleme anındaki
      kopyadan geldi — ziyaretçiye tarihli uyarı gösterilmeli. */
  yedekMi?: boolean;
};

/* data/dukkan.json — dolduruldu bayrağı false iken hiçbir şey gösterilmez */
export type Dukkan = {
  dolduruldu?: boolean;
  ad?: string;
  adres?: { satir?: string; ilce?: string; il?: string; haritaUrl?: string };
  iletisim?: { telefon?: string; whatsapp?: string };
  saatler?: { gunler: string; acilis: string; kapanis: string }[];
  siparis?: { var?: boolean; yontem?: string; aciklama?: string; teslimat?: string };
  odeme?: string[];
  fotograf?: string | null;
};

export type Durum = {
  acik: boolean;
  kapanis: string | null;
  metin: string;
  ayrinti: string;
};
