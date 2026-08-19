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

export const indirimYuzde = (u: Urun) =>
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

/** Türkçe arama için sadeleştirme — büyük/küçük ve aksan duyarsız. */
export const sadelestir = (s: string) =>
  String(s).toLocaleLowerCase("tr")
    .replace(/[ıîi̇]/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g")
    .replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c")
    .trim();

/** Virgüllü veya noktalı kullanıcı girişini sayıya çevirir. */
export function sayiyaCevir(girdi: unknown): number | null {
  if (typeof girdi === "number") return isFinite(girdi) ? girdi : null;
  if (typeof girdi !== "string") return null;
  const t = girdi.trim().replace(/\s/g, "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return isFinite(n) ? n : null;
}

