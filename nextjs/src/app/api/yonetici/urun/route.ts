import { NextResponse } from "next/server";
import { sqlAl } from "@/lib/veritabani";
import { oturumDogrula } from "@/lib/auth";
import {
  urunYuku,
  yamaDogrula,
  fiyatUyarilari,
  DUZENLENEBILIR,
} from "@/lib/yonetici";

export async function PATCH(req: Request) {
  const tur = req.headers.get("content-type") ?? "";
  if (!tur.toLowerCase().includes("application/json")) {
    return NextResponse.json(
      { hata: "Content-Type application/json olmalı" },
      { status: 415, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const oturum = await oturumDogrula();
    if (!oturum) {
      return NextResponse.json(
        { hata: "Oturum gerekli" },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }

    let govde: any;
    try {
      govde = await req.json();
    } catch {
      govde = null;
    }

    if (!govde || typeof govde !== "object" || Array.isArray(govde)) {
      return NextResponse.json(
        { hata: "Gövde bir JSON nesnesi olmalı" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const id = govde.id;
    if (typeof id !== "string" || !id) {
      return NextResponse.json(
        { hata: "id gerekli" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const sql = sqlAl();

    const bulunan = await sql`
      SELECT id, ad, reyon, gorsel, fiyat, eski_fiyat, miktar, birim,
             stokta, kaynak, guncellendi
        FROM urunler WHERE id = ${id} LIMIT 1
    `;
    const mevcut = bulunan[0];
    if (!mevcut) {
      return NextResponse.json(
        { hata: `"${id}" numaralı ürün bulunamadı` },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }

    const dokunulan = DUZENLENEBILIR.filter((k) =>
      Object.prototype.hasOwnProperty.call(govde, k)
    );
    const taninmayan = Object.keys(govde).filter(
      (k) => k !== "id" && !DUZENLENEBILIR.includes(k as any)
    );

    if (dokunulan.length === 0 && taninmayan.length === 0) {
      return NextResponse.json(
        {
          hata: "Değiştirilecek alan yok",
          duzenlenebilir: DUZENLENEBILIR,
        },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const { hatalar, yeniFiyat, yeniEski, yeniMiktar, yeniBirim } =
      yamaDogrula(mevcut, govde);

    if (hatalar.length) {
      return NextResponse.json(
        {
          hata: hatalar.length === 1 ? hatalar[0] : `${hatalar.length} alan geçersiz`,
          hatalar,
        },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const fiyatGonderildi = Object.prototype.hasOwnProperty.call(govde, "fiyat");
    const yeniKaynak = fiyatGonderildi ? "dukkan" : mevcut.kaynak;

    let uyarilar: string[] = [];
    if (fiyatGonderildi && yeniFiyat !== Number(mevcut.fiyat)) {
      const [{ medyan }] = await sql`
        SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY fiyat) AS medyan
          FROM urunler WHERE reyon = ${mevcut.reyon}
      `;
      uyarilar = fiyatUyarilari(mevcut.fiyat, yeniFiyat, Number(medyan ?? 0));
    }

    const guncel = await sql`
      UPDATE urunler
         SET fiyat      = ${yeniFiyat},
             eski_fiyat = ${yeniEski},
             miktar     = ${yeniMiktar},
             birim      = ${yeniBirim},
             stokta     = ${
               Object.prototype.hasOwnProperty.call(govde, "stokta")
                 ? govde.stokta
                 : mevcut.stokta
             },
             kaynak     = ${yeniKaynak}
       WHERE id = ${id}
      RETURNING id, ad, reyon, gorsel, fiyat, eski_fiyat, miktar, birim,
                stokta, kaynak, guncellendi
    `;

    return NextResponse.json(
      {
        guncellendi: true,
        degisenAlanlar: dokunulan,
        urun: urunYuku(guncel[0], true),
        ...(uyarilar.length ? { uyarilar } : {}),
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    console.error("yonetici/urun başarısız:", (e as Error).message);
    return NextResponse.json(
      { hata: "Ürün güncellenemedi" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
