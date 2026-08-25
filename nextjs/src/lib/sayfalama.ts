/* =====================================================================
   Ana sayfa sayfalaması.

   NEDEN: 470 kartın tamamı sunucuda çiziliyordu ve ham HTML 634 KB'a
   çıkıyordu. Ziyaretçinin ilk ekranda gördüğü kart sayısı 8-12; geri
   kalan 458'i indirmek, ayrıştırmak ve DOM'a basmak boşa maliyet.

   TASARIM:
   - Sunucu, adresteki sayfanın 30 ürününü çiziyor.
   - JavaScript açıkken kaydırdıkça 30'ar ekleniyor, 150'de duruyor.
   - 150'den sonrası "Daha fazla göster" ile, dokunuşla.
   - Otomatik yüklemenin ve düğmenin arkasında GERÇEK adres var
     (?sayfa=N). JavaScript kapalıyken bağlantı çalışıyor, arama motoru
     izleyebiliyor.

   SÜZGEÇLERLE İLİŞKİ — bilinçli karar:
   Süzgeç ya da arama etkinken sayfalama DEVRE DIŞI, eşleşen her ürün
   gösteriliyor. Gerekçe: süzen ziyaretçi belirli bir şey arıyor ve
   sonuç kümesi zaten küçük ("çikolata" → 38). Onu da sayfalamak,
   aradığı şeyi kaydırmanın arkasına saklamak olurdu. Süzme istemcide
   kaldığı için istemcinin 470 ürünün hafif verisine tam erişimi var;
   sayfalama yalnızca ÇİZİM'i sınırlıyor, veriyi değil.
   ===================================================================== */

/** Bir sayfada kaç ürün çizilir. */
export const SAYFA_BOYUTU = 30;

/** Kaç üründen sonra otomatik yükleme durup düğmeye bırakılır. */
export const OTOMATIK_SINIR = 150;

/** İki otomatik dilim arasındaki en kısa süre (ms).
 *  Ziyaretçi sayfanın sonuna sabitlendiğinde tarayıcı onu orada tutuyor
 *  ve nöbetçi görünürde kalıyor; bu sınır olmadan tek kaydırmada 30'dan
 *  150'ye atlıyordu (ölçüldü). "30'ar ekleniyor" gözle görülür kalsın. */
export const DILIM_ARALIGI_MS = 500;

/** Adresten gelen ?sayfa değerini güvenli bir tam sayıya çevirir.
 *  Geçersiz, sıfır, negatif ya da sayı olmayan her şey null döner —
 *  çağıran 404 verebilsin diye. "?sayfa=1" geçerli sayılıyor ama kanonik
 *  adresi parametresiz "/" — yinelenen içeriği canonical kapatıyor. */
export function sayfaCoz(ham: string | string[] | undefined): number | null {
  if (ham === undefined) return 1;
  const metin = Array.isArray(ham) ? ham[0] : ham;
  if (!/^\d+$/.test(metin)) return null;
  const n = Number(metin);
  if (n < 1) return null;
  return n;
}

/** Toplam sayfa sayısı. */
export const toplamSayfa = (adet: number) =>
  Math.max(1, Math.ceil(adet / SAYFA_BOYUTU));

/** N. sayfanın ürün aralığı (0 tabanlı, bitiş hariç). */
export function sayfaAraligi(sayfa: number) {
  const baslangic = (sayfa - 1) * SAYFA_BOYUTU;
  return { baslangic, bitis: baslangic + SAYFA_BOYUTU };
}

/** ?sayfa bağlantısı. 1. sayfa parametresiz — kanonik adres o. */
export const sayfaAdresi = (sayfa: number) => (sayfa <= 1 ? "/" : `/?sayfa=${sayfa}`);
