import type { Urun } from "./tipler";

export const GECERLI_BIRIMLER = ["kg", "L", "adet"] as const;
export type Birim = (typeof GECERLI_BIRIMLER)[number];

export const DUZENLENEBILIR = ["fiyat", "eskiFiyat", "miktar", "birim", "stokta"] as const;

export type UrunYuku = Urun & {
  guncellendi?: string | Date | null;
};

export function urunYuku(u: Record<string, unknown>, damgaEkle = false): UrunYuku {
  const sayi = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  const yuk: UrunYuku = {
    id: String(u.id ?? ""),
    ad: String(u.ad ?? ""),
    reyon: String(u.reyon ?? ""),
    gorsel: (u.gorsel as string) ?? null,
    fiyat: sayi(u.fiyat) ?? 0,
    eskiFiyat: sayi(u.eski_fiyat ?? u.eskiFiyat),
    kaynak: (u.kaynak as string) ?? null,
    miktar: sayi(u.miktar),
    birim: (u.birim as string) ?? null,
    stokta: Boolean(u.stokta),
  };
  if (damgaEkle && u.guncellendi) yuk.guncellendi = u.guncellendi as string | Date;
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

export function yamaDogrula(mevcut: Record<string, unknown>, yama: Yama) {
  const hatalar: string[] = [];

  const bilinmeyen = Object.keys(yama).filter((k) => k !== "id" && !DUZENLENEBILIR.includes(k as (typeof DUZENLENEBILIR)[number]));
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

  /* --- eskiFiyat ---
     mevcut satır iki biçimde gelebiliyor: veritabanından eski_fiyat,
     API yükünden eskiFiyat. İkisi de YOKSA sonuç null olmalı.

     Buradaki ?? zinciri sonuna kadar götürülmeli: `a ?? b` ifadesinde a
     null ve b tanımsızsa sonuç undefined olur, `undefined === null` ise
     false'tur ve Number(undefined) NaN verir. NaN sonra "eskiFiyat güncel
     fiyattan büyük olmalı" kontrolüne düşer (NaN > x her zaman false),
     yani indirimsiz her ürünün fiyat güncellemesi 400 ile reddedilirdi.
     Bu, taşıma sırasında oluşmuş ve 470 üründen 433'ünü panelden
     düzenlenemez hale getirmişti; tests/asama2-yetkili.mjs yakaladı. */
  const mevcutEski = mevcut.eski_fiyat ?? mevcut.eskiFiyat ?? null;
  let yeniEski = mevcutEski === null ? null : Number(mevcutEski);
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
    if (typeof yeniBirim !== "string" || !GECERLI_BIRIMLER.includes(yeniBirim as Birim)) {
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

export type YeniUrunGirdisi = {
  ad: string;
  reyon: string;
  fiyat: number;
  eskiFiyat?: number | null;
  miktar?: number | null;
  birim?: string | null;
  stokta?: boolean;
  gorsel?: string | null;
};

export function yeniUrunDogrula(girdi: Record<string, unknown> | null | undefined, gecerliReyonlar?: string[]) {
  const hatalar: string[] = [];

  // ad
  const ad = typeof girdi?.ad === "string" ? girdi.ad.trim() : "";
  if (!ad || ad.length < 2) {
    hatalar.push("Ürün adı en az 2 karakter olmalı");
  } else if (ad.length > 200) {
    hatalar.push("Ürün adı en fazla 200 karakter olabilir");
  }

  // reyon
  const reyon = typeof girdi?.reyon === "string" ? girdi.reyon.trim() : "";
  if (!reyon) {
    hatalar.push("Reyon seçimi zorunlu");
  } else if (gecerliReyonlar && gecerliReyonlar.length > 0 && !gecerliReyonlar.includes(reyon)) {
    hatalar.push(`Geçersiz reyon: "${reyon}"`);
  }

  // fiyat
  const f = typeof girdi?.fiyat === "number" ? girdi.fiyat : Number(girdi?.fiyat);
  let temizFiyat = 0;
  if (typeof f !== "number" || !isFinite(f) || isNaN(f)) {
    hatalar.push("Fiyat geçerli bir sayı olmalı");
  } else if (!(f > 0)) {
    hatalar.push("Fiyat sıfırdan büyük olmalı");
  } else if (ondalikSayisi(f) > ONDALIK_EN_FAZLA) {
    hatalar.push(`Fiyat en fazla ${ONDALIK_EN_FAZLA} ondalık basamak içerebilir (kuruş)`);
  } else {
    temizFiyat = f;
  }

  // eskiFiyat
  let temizEskiFiyat: number | null = null;
  if (girdi?.eskiFiyat !== undefined && girdi?.eskiFiyat !== null && girdi?.eskiFiyat !== "") {
    const ef = typeof girdi.eskiFiyat === "number" ? girdi.eskiFiyat : Number(girdi.eskiFiyat);
    if (typeof ef !== "number" || !isFinite(ef) || isNaN(ef)) {
      hatalar.push("İndirimden önceki fiyat sayı olmalı");
    } else if (!(ef > 0)) {
      hatalar.push("İndirimden önceki fiyat sıfırdan büyük olmalı");
    } else if (ondalikSayisi(ef) > ONDALIK_EN_FAZLA) {
      hatalar.push(`İndirimden önceki fiyat en fazla ${ONDALIK_EN_FAZLA} ondalık basamak içerebilir`);
    } else if (temizFiyat > 0 && !(ef > temizFiyat)) {
      hatalar.push("İndirimden önceki fiyat güncel fiyattan büyük olmalı");
    } else {
      temizEskiFiyat = ef;
    }
  }

  // miktar & birim
  let temizMiktar: number | null = null;
  let temizBirim: string | null = null;
  const m = girdi?.miktar !== undefined && girdi?.miktar !== null && girdi?.miktar !== ""
    ? (typeof girdi.miktar === "number" ? girdi.miktar : Number(girdi.miktar))
    : null;
  const b = typeof girdi?.birim === "string" && girdi.birim.trim() ? girdi.birim.trim() : null;

  if (m !== null) {
    if (typeof m !== "number" || !isFinite(m) || isNaN(m)) {
      hatalar.push("Miktar sayı olmalı");
    } else if (!(m > 0)) {
      hatalar.push("Miktar sıfırdan büyük olmalı");
    } else {
      temizMiktar = m;
    }
  }

  if (b !== null) {
    if (!GECERLI_BIRIMLER.includes(b as Birim)) {
      hatalar.push(`Birim yalnızca ${GECERLI_BIRIMLER.join(", ")} olabilir`);
    } else {
      temizBirim = b;
    }
  }

  if ((temizMiktar === null) !== (temizBirim === null)) {
    hatalar.push("Miktar ve birim birlikte girilmeli veya ikisi de boş bırakılmalı");
  }

  if (temizBirim === "adet" && typeof temizMiktar === "number" && !Number.isInteger(temizMiktar)) {
    hatalar.push('Birim "adet" olduğunda miktar tam sayı olmalı');
  }

  // stokta
  const stokta = girdi?.stokta !== false;

  // gorsel
  let gorsel: string | null = null;
  if (typeof girdi?.gorsel === "string" && girdi.gorsel.trim()) {
    const g = girdi.gorsel.trim();
    if (/^https?:\/\/.+/i.test(g) || g.startsWith("/")) {
      gorsel = g;
    } else {
      hatalar.push("Görsel geçerli bir URL (http/https) veya yerel yol olmalı");
    }
  }

  return {
    hatalar,
    urun: {
      ad,
      reyon,
      fiyat: temizFiyat,
      eskiFiyat: temizEskiFiyat,
      miktar: temizMiktar,
      birim: temizBirim,
      stokta,
      gorsel,
    },
  };
}

