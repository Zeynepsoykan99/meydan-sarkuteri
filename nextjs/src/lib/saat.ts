/* =====================================================================
   Saat, gün ve bağlantı mantığı — SAF. next/* bağımlılığı YOK, bu yüzden
   çıplak Node'dan (sınamalardan) doğrudan import edilebiliyor.

   js/dukkan.js'ten olduğu gibi taşındı; ölçülerek doğrulanmıştı:
     - "Her gün" gibi toplu ifadeler, aralıklar, listeler
     - gece yarısını aşan saatler ertesi güne taşınıyor
     - bulunma hâli eki SÖYLENEN son sayıya bakıyor (07:30'da, 08:00'de)
     - saat dilimi Europe/Istanbul'a sabit
   ===================================================================== */

import type { Dukkan, Durum } from "./tipler";

const GUN_ADI = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
const GUN_INDEKS: Record<string, number> = {
  pazar: 0, pazartesi: 1, sali: 2, carsamba: 3, persembe: 4, cuma: 5, cumartesi: 6,
};
const TOPLU: Record<string, number[]> = {
  hergun: [0, 1, 2, 3, 4, 5, 6],
  "her gun": [0, 1, 2, 3, 4, 5, 6],
  "hafta ici": [1, 2, 3, 4, 5],
  haftaici: [1, 2, 3, 4, 5],
  "hafta sonu": [6, 0],
  haftasonu: [6, 0],
};

const sade = (s: string) =>
  String(s).toLocaleLowerCase("tr")
    .replace(/[ıîi̇]/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g")
    .replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c").trim();

export function gunleriCoz(metin: unknown): number[] {
  if (typeof metin !== "string" || !metin.trim()) return [];
  const toplu = TOPLU[sade(metin)];
  if (toplu) return [...toplu];

  const aralik = metin.split(/\s*[–—-]\s*/);
  if (aralik.length === 2) {
    const a = GUN_INDEKS[sade(aralik[0])];
    const b = GUN_INDEKS[sade(aralik[1])];
    if (a === undefined || b === undefined) return [];
    const cikti: number[] = [];
    for (let i = 0, g = a; i < 7; i++, g = (g + 1) % 7) {
      cikti.push(g);
      if (g === b) return cikti;      // haftayı aşan aralık da çalışıyor
    }
    return cikti;
  }
  return metin.split(/\s*(?:,|ve)\s*/i)
    .map((p) => GUN_INDEKS[sade(p)])
    .filter((x): x is number => x !== undefined);
}

export function dakikaya(metin: unknown): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(metin ?? "").trim());
  if (!m) return null;
  const sa = Number(m[1]), dk = Number(m[2]);
  if (sa > 23 || dk > 59) return null;
  return sa * 60 + dk;
}

const saatYazi = (dk: number) =>
  `${String(Math.floor(dk / 60)).padStart(2, "0")}:${String(dk % 60).padStart(2, "0")}`;

/* Ek, SÖYLENEN son sayıya bakar: dakika sıfırsa saate ("sekizde"),
   değilse dakikaya ("yedi otuzda"). 0–59 kapalı küme, tablo taşamaz. */
const BIRLER_EK: Record<number, string> = {
  1: "de", 2: "de", 3: "te", 4: "te", 5: "te", 6: "da", 7: "de", 8: "de", 9: "da",
};
const ONLAR_EK: Record<number, string> = { 1: "da", 2: "de", 3: "da", 4: "ta", 5: "de" };

function sayiEki(n: number): string {
  if (n === 0) return "da";
  if (n % 10 === 0) return ONLAR_EK[n / 10] ?? "da";
  return BIRLER_EK[n % 10] ?? "de";
}

export function saatEki(dk: number): string {
  const sa = Math.floor(dk / 60), da = dk % 60;
  return da === 0 ? sayiEki(sa) : sayiEki(da);
}

type Aralik = { gun: number; bas: number; son: number; devam: boolean };

function araliklar(saatler: Dukkan["saatler"]): Aralik[] {
  const liste: Aralik[] = [];
  for (const k of Array.isArray(saatler) ? saatler : []) {
    const gunler = gunleriCoz(k?.gunler);
    const bas = dakikaya(k?.acilis);
    const son = dakikaya(k?.kapanis);
    if (!gunler.length || bas === null || son === null || bas === son) continue;
    for (const g of gunler) {
      if (son > bas) liste.push({ gun: g, bas, son, devam: false });
      else {
        liste.push({ gun: g, bas, son: 1440, devam: false });
        liste.push({ gun: (g + 1) % 7, bas: 0, son, devam: true });
      }
    }
  }
  return liste;
}

const ISTANBUL = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Istanbul",
  weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const KISA_GUN: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function istanbulZamani(tarih?: Date) {
  const p = Object.fromEntries(
    ISTANBUL.formatToParts(tarih ?? new Date()).map((x) => [x.type, x.value]));
  return { gun: KISA_GUN[p.weekday], dakika: Number(p.hour) * 60 + Number(p.minute) };
}

export function durumHesapla(saatler: Dukkan["saatler"], tarih?: Date): Durum | null {
  const liste = araliklar(saatler);
  if (!liste.length) return null;

  const { gun, dakika } = istanbulZamani(tarih);

  const suan = liste.find((a) => a.gun === gun && dakika >= a.bas && dakika < a.son);
  if (suan) {
    return {
      acik: true,
      kapanis: suan.son >= 1440 ? null : saatYazi(suan.son),
      metin: "Şu an açık",
      ayrinti: suan.son >= 1440 ? "" : `Kapanış ${saatYazi(suan.son)}`,
    };
  }

  for (let d = 0; d < 8; d++) {
    const g = (gun + d) % 7;
    const adaylar = liste
      .filter((a) => a.gun === g && !a.devam && (d > 0 || a.bas > dakika))
      .map((a) => a.bas)
      .sort((x, y) => x - y);
    if (!adaylar.length) continue;
    const bas = adaylar[0];
    const ne = d === 0 ? "Bugün" : d === 1 ? "Yarın" : GUN_ADI[g];
    return {
      acik: false, kapanis: null, metin: "Şu an kapalı",
      ayrinti: `${ne} ${saatYazi(bas)}'${saatEki(bas)} açılır`,
    };
  }
  return { acik: false, kapanis: null, metin: "Şu an kapalı", ayrinti: "" };
}

/* ---------------- bağlantılar ---------------- */

export const doluMu = (v: unknown): v is string =>
  typeof v === "string" && v.trim() !== "";

export const telAdresi = (ham: string) => "tel:" + String(ham).replace(/[^\d+]/g, "");

export function whatsappAdresi(ham: string, mesaj?: string): string | null {
  let d = String(ham).replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0")) d = "90" + d.slice(1);
  if (d.length < 10) return null;
  const u = `https://wa.me/${d}`;
  return mesaj ? `${u}?text=${encodeURIComponent(mesaj)}` : u;
}
