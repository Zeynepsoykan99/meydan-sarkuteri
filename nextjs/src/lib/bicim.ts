import type { Urun } from "./tipler";

/* =====================================================================
   Biçimleme ve birim fiyat.

   Ayrıştırıcı js/app.js'ten taşındı; üç bilinen tuzağı reddediyor:
     - "3 Katlı" adet sanılmıyor (kat listede yok)
     - "1-2 kg" gibi aralıklar ölçü sayılmıyor (önceki karakter kontrolü)
     - iki ölçü geçen adlarda belirsizlik kabul ediliyor, tahmin yok
   ===================================================================== */

const paraBicim = new Intl.NumberFormat("tr-TR", {
  style: "currency", currency: "TRY", minimumFractionDigits: 2,
});
export const para = (n: number) => paraBicim.format(n);

/** Fiyatı etiket için lira/kuruş parçalarına ayırır. */
export function etiketParcalari(fiyat: number) {
  const [lira, kurus] = fiyat.toFixed(2).split(".");
  return { lira: Number(lira).toLocaleString("tr-TR"), kurus };
}

/* Tam Urun istemiyor: yalnızca bu iki alanı okuyor. Böylece istemciye
   giden hafif KartVerisi de doğrudan geçirilebiliyor. */
export const indirimYuzde = (u: { fiyat: number; eskiFiyat: number | null }) =>
  u.eskiFiyat ? Math.round((1 - u.fiyat / u.eskiFiyat) * 100) : 0;

/* ---------------- birim fiyat ---------------- */

const BIRIM_CARPAN: Record<string, number> = {
  g: 0.001, gr: 0.001, kg: 1, ml: 0.001, cl: 0.01, l: 1, lt: 1,
};
const AGIRLIK_BIRIMI = new Set(["g", "gr", "kg"]);
const OLCU_RE = /(?:(\d+)\s*[x×]\s*)?(\d+(?:[.,]\d+)?)\s*(kg|gr|g|ml|cl|lt|l)\b/gi;
// "32'li" / "40'lı" / "25 adet" — "3 Katlı"yı yakalamamak için "kat" listede yok
const ADET_RE = /(\d+)\s*['’]?\s*(?:l[iıuü]|adet|rulo)\b/i;

type Olcu = { birim: string; deger: number };

export function olcuCikar(ad: string): Olcu | null {
  const bulunan: Olcu[] = [];
  let m: RegExpExecArray | null;
  OLCU_RE.lastIndex = 0;
  while ((m = OLCU_RE.exec(ad)) !== null) {
    // Önündeki karakter rakam/tire/bölü ise bu bir aralık ya da oran; ölçü değil
    const onceki = ad[m.index - 1];
    if (onceki && /[\d\-.,/]/.test(onceki)) continue;

    const adet = m[1] ? Number(m[1]) : 1;
    const miktar = Number(m[2].replace(",", "."));
    if (!(adet > 0) || !(miktar > 0)) continue;

    const b = m[3].toLowerCase();
    bulunan.push({
      birim: AGIRLIK_BIRIMI.has(b) ? "kg" : "L",
      deger: adet * miktar * BIRIM_CARPAN[b],
    });
  }
  if (bulunan.length === 1) return bulunan[0];
  if (bulunan.length > 1) return null;          // belirsiz, tahmin etme

  const a = ad.match(ADET_RE);                  // ağırlık/hacim yoksa adede düş
  return a && Number(a[1]) > 1 ? { birim: "adet", deger: Number(a[1]) } : null;
}

function olcu(u: Urun): Olcu | null {
  // Veriye öncelik: miktar/birim doldurulmuşsa ad ayrıştırılmıyor
  if (typeof u.miktar === "number" && u.miktar > 0 && u.birim) {
    return { deger: u.miktar, birim: u.birim };
  }
  return olcuCikar(u.ad);
}

export function birimFiyat(u: Urun): Olcu | null {
  const o = olcu(u);
  if (!o) return null;
  const deger = u.fiyat / o.deger;
  // 1 kg / 1 L ambalajda birim fiyat, fiyatın kendisi — tekrar etmenin anlamı yok
  if (Math.abs(deger - u.fiyat) < 0.01) return null;
  return { deger, birim: o.birim };
}

export function birimFiyatYazi(u: Urun): string {
  const bf = birimFiyat(u);
  if (!bf) return "";
  const sayi = bf.deger >= 100
    ? Math.round(bf.deger).toLocaleString("tr-TR")
    : bf.deger.toFixed(2).replace(".", ",");
  return `₺${sayi}/${bf.birim}`;
}

/** Sunucuda çalışır: tam Urun -> istemciye gidecek hafif KartVerisi.
 *  Birim fiyat burada bir kez hesaplanıyor; istemci 470 ürün için regex
 *  ayrıştırmayı tekrar yapmıyor ve miktar/birim/kaynak hiç gönderilmiyor. */
export function kartVerisi(u: Urun): import("./tipler").KartVerisi {
  const bf = birimFiyat(u);
  return {
    id: u.id,
    ad: u.ad,
    reyon: u.reyon,
    gorsel: u.gorsel,
    fiyat: u.fiyat,
    eskiFiyat: u.eskiFiyat,
    stokta: u.stokta !== false,
    bfYazi: birimFiyatYazi(u),
    bfDeger: bf ? bf.deger : Infinity,
    bfGrup: !bf ? 2 : bf.birim === "adet" ? 1 : 0,
  };
}

/** Türkçe arama için sadeleştirme — büyük/küçük ve aksan duyarsız. */
export const sadelestir = (s: string) =>
  String(s).toLocaleLowerCase("tr")
    .replace(/[ıîi̇]/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g")
    .replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c")
    .trim();

/** Virgüllü veya noktalı kullanıcı girişini sayıya çevirir.
 *
 *  ÜÇ AYRI SONUÇ, üçü de anlamlı — çağıran ayırt edebilmeli:
 *    null : alan BOŞ           → "değere dokunulmadı"
 *    NaN  : alan GEÇERSİZ      → "kullanıcı bir şey yazdı ama sayı değil"
 *    sayı : geçerli
 *
 *  null ile NaN'ı birbirine karıştırmak sessiz veri kaybı üretiyor:
 *  geçersiz girdi "boş" sayılırsa fiyat sessizce yok sayılır, miktar ise
 *  null'a çekilip ürünün ölçüsü SİLİNİR. Bu tam olarak taşımada olan şeydi.
 *
 *  Regex bilerek katı (kökteki api/_lib ile aynı): çıplak Number() "-5",
 *  "1e5", "0x10", "+7" gibi girdileri kabul ediyor ve bunlar istemci
 *  doğrulamasından sızıp sunucuya kadar gidiyordu. */
export function sayiyaCevir(girdi: unknown): number | null | typeof NaN {
  if (typeof girdi === "number") return isFinite(girdi) ? girdi : NaN;
  if (typeof girdi !== "string") return null;
  const temiz = girdi.trim().replace(/\s/g, "").replace(",", ".");
  if (temiz === "") return null;
  if (!/^\d*\.?\d+$/.test(temiz)) return NaN;   // geçersiz: çağıran karar versin
  return Number(temiz);
}

