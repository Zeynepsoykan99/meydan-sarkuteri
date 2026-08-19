import type { Urun } from "./tipler";

export const GECERLI_BIRIMLER = ["kg", "L", "adet"] as const;
export type Birim = (typeof GECERLI_BIRIMLER)[number];

export const DUZENLENEBILIR = ["fiyat", "eskiFiyat", "miktar", "birim", "stokta"] as const;

export type UrunYuku = Urun & {
  guncellendi?: string | Date | null;
};

export function urunYuku(u: any, damgaEkle = false): UrunYuku {
  const sayi = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  const yuk: UrunYuku = {
    id: u.id,
    ad: u.ad,
    reyon: u.reyon,
    gorsel: u.gorsel ?? null,
    fiyat: sayi(u.fiyat) ?? 0,
    eskiFiyat: sayi(u.eski_fiyat ?? u.eskiFiyat),
    kaynak: u.kaynak ?? null,
    miktar: sayi(u.miktar),
    birim: u.birim ?? null,
    stokta: u.stokta,
  };
  if (damgaEkle && u.guncellendi) yuk.guncellendi = u.guncellendi;
  return yuk;
}

const ONDALIK_EN_FAZLA = 2;

function ondalikSayisi(n: number): number {
  const s = String(n);
  if (!s.includes(".")) return 0;
  return s.split(".")[1].length;
}

export type Yama = {
  id?: string;
  fiyat?: number;
  eskiFiyat?: number | null;
  miktar?: number | null;
  birim?: string | null;
  stokta?: boolean;
  [key: string]: unknown;
};

export function yamaDogrula(mevcut: any, yama: Yama) {
  const hatalar: string[] = [];

  const bilinmeyen = Object.keys(yama).filter((k) => k !== "id" && !DUZENLENEBILIR.includes(k as any));
  for (const k of bilinmeyen) {
    hatalar.push(`"${k}" alanı düzenlenemez. Düzenlenebilir alanlar: ${DUZENLENEBILIR.join(", ")}`);
  }

  const verildi = (k: string) => Object.prototype.hasOwnProperty.call(yama, k);

  /* --- fiyat --- */
  let yeniFiyat = Number(mevcut.fiyat);
  if (verildi("fiyat")) {
    const f = yama.fiyat;
    if (typeof f !== "number" || !isFinite(f)) {
      hatalar.push("fiyat sayı olmalı");
    } else if (!(f > 0)) {
      hatalar.push("fiyat sıfırdan büyük olmalı");
    } else if (ondalikSayisi(f) > ONDALIK_EN_FAZLA) {
      hatalar.push(`fiyat en fazla ${ONDALIK_EN_FAZLA} ondalık basamak içerebilir (kuruş)`);
    } else {
      yeniFiyat = f;
    }
  }

  /* --- eskiFiyat --- */
  let yeniEski = (mevcut.eski_fiyat ?? mevcut.eskiFiyat) === null ? null : Number(mevcut.eski_fiyat ?? mevcut.eskiFiyat);
  if (verildi("eskiFiyat")) {
    const e = yama.eskiFiyat;
    if (e === null) {
      yeniEski = null;
    } else if (typeof e !== "number" || !isFinite(e)) {
      hatalar.push("eskiFiyat sayı ya da null olmalı");
    } else if (!(e > 0)) {
      hatalar.push("eskiFiyat sıfırdan büyük olmalı");
    } else if (ondalikSayisi(e) > ONDALIK_EN_FAZLA) {
      hatalar.push(`eskiFiyat en fazla ${ONDALIK_EN_FAZLA} ondalık basamak içerebilir (kuruş)`);
    } else {
      yeniEski = e;
    }
  }
  if (yeniEski !== null && !(yeniEski > yeniFiyat)) {
    hatalar.push(
      `eskiFiyat (${yeniEski}) güncel fiyattan (${yeniFiyat}) büyük olmalı — ` +
      "indirim, fiyatın düşmüş olması demek"
    );
  }

  /* --- miktar / birim --- */
  let yeniMiktar = verildi("miktar")
    ? yama.miktar
    : mevcut.miktar === null ? null : Number(mevcut.miktar);
  let yeniBirim = verildi("birim") ? yama.birim : mevcut.birim;

  if (verildi("miktar") && yeniMiktar !== null && yeniMiktar !== undefined) {
    if (typeof yeniMiktar !== "number" || !isFinite(yeniMiktar)) {
      hatalar.push("miktar sayı ya da null olmalı");
      yeniMiktar = null;
    } else if (!(yeniMiktar > 0)) {
      hatalar.push("miktar sıfırdan büyük olmalı");
    }
  }
  if (verildi("birim") && yeniBirim !== null && yeniBirim !== undefined) {
    if (typeof yeniBirim !== "string" || !GECERLI_BIRIMLER.includes(yeniBirim as any)) {
      hatalar.push(`birim yalnızca ${GECERLI_BIRIMLER.join(", ")} olabilir (gelen: ${JSON.stringify(yama.birim)})`);
      yeniBirim = null;
    }
  }
  if ((yeniMiktar === null || yeniMiktar === undefined) !== (yeniBirim === null || yeniBirim === undefined)) {
    hatalar.push(
      "miktar ve birim birlikte dolu ya da birlikte boş olmalı " +
      `(sonuç: miktar=${JSON.stringify(yeniMiktar)}, birim=${JSON.stringify(yeniBirim)})`
    );
  }
  if (yeniBirim === "adet" && typeof yeniMiktar === "number" && !Number.isInteger(yeniMiktar)) {
    hatalar.push(`birim "adet" olduğunda miktar tam sayı olmalı (gelen: ${yeniMiktar})`);
  }

  /* --- stokta --- */
  if (verildi("stokta") && typeof yama.stokta !== "boolean") {
    hatalar.push(`stokta true ya da false olmalı (gelen: ${JSON.stringify(yama.stokta)})`);
  }

  return { hatalar, yeniFiyat, yeniEski, yeniMiktar, yeniBirim };
}

export function fiyatUyarilari(eskiFiyat: number | string, yeniFiyat: number, reyonMedyan: number): string[] {
  const uyarilar: string[] = [];
  const onceki = Number(eskiFiyat);

  if (onceki > 0 && yeniFiyat > 0) {
    const kat = yeniFiyat / onceki;
    if (kat >= 10) {
      uyarilar.push(
        `Fiyat ${Math.round(kat)} kat arttı (₺${onceki} → ₺${yeniFiyat}). ` +
        "Ondalık ayracını atlamış olabilirsiniz."
      );
    } else if (kat <= 0.1) {
      uyarilar.push(
        `Fiyat ${Math.round(1 / kat)} kat azaldı (₺${onceki} → ₺${yeniFiyat}). ` +
        "Fazladan sıfır silmiş olabilirsiniz."
      );
    }
  }

  if (reyonMedyan > 0 && yeniFiyat > reyonMedyan * 12) {
    uyarilar.push(
      `Fiyat, reyon medyanının (₺${reyonMedyan}) ${Math.round(yeniFiyat / reyonMedyan)} katı.`
    );
  }

  return uyarilar;
}
