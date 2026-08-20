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
};

export type Reyon = {
  id: string;
  ad: string;
  ikon: string | null;
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
