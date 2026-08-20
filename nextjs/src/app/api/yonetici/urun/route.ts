import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { sqlAl } from "@/lib/veritabani";
import { oturumDogrula } from "@/lib/auth";
import {
  urunYuku,
  yamaDogrula,
  yeniUrunDogrula,
  fiyatUyarilari,
  DUZENLENEBILIR,
} from "@/lib/yonetici";

/* Katalog önbelleğini elle tazele.
   cacheLife("minutes") yüzünden panelden yapılan bir değişiklik ziyaretçiye
   bir dakikaya kadar gecikmeyle yansıyordu; ürün EKLENİP SİLİNDİĞİNDE bu
   daha da yanıltıcıydı (olmayan ürün listede durmaya devam ediyordu).
   Bu çağrılar daha önce src/app/panel/actions.ts içindeydi ama o dosya
   hiçbir yerden çağrılmıyordu — yani tazeleme hiç çalışmıyordu. Dosya
   silindi, çağrılar gerçekten kullanılan yola taşındı. */
function tazele() {
  revalidatePath("/");
  revalidatePath("/panel");
}

/* =====================================================================
   Yönetici Ürün API Uçları:
   - PATCH: Ürün alanlarını güncelleme
   - POST: Yeni ürün ekleme
   - DELETE: Ürün silme
   ===================================================================== */

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

    let govde: Record<string, unknown> | null;
    try {
      govde = (await req.json()) as Record<string, unknown>;
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
      (k) => k !== "id" && !DUZENLENEBILIR.includes(k as (typeof DUZENLENEBILIR)[number])
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

    console.log(
      `[DENETİM] Ürün güncellendi: id=${id} ("${mevcut.ad}"), kullanıcı="${oturum.kullanici_adi}", ` +
      `alanlar=[${dokunulan.join(", ")}], fiyat: ${mevcut.fiyat} → ${yeniFiyat}`
    );

    tazele();

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
    console.error("yonetici/urun PATCH başarısız:", (e as Error).message);
    return NextResponse.json(
      { hata: "Ürün güncellenemedi" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export async function POST(req: Request) {
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

    let govde: Record<string, unknown> | null;
    try {
      govde = (await req.json()) as Record<string, unknown>;
    } catch {
      govde = null;
    }

    if (!govde || typeof govde !== "object" || Array.isArray(govde)) {
      return NextResponse.json(
        { hata: "Gövde bir JSON nesnesi olmalı" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const sql = sqlAl();
    const reyonlar = await sql`SELECT id FROM reyonlar`;
    const reyonIdleri = (reyonlar as { id: string }[]).map((r) => r.id);

    const { hatalar, urun } = yeniUrunDogrula(govde, reyonIdleri);
    if (hatalar.length > 0) {
      return NextResponse.json(
        {
          hata: hatalar.length === 1 ? hatalar[0] : `${hatalar.length} alan geçersiz`,
          hatalar,
        },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const eklenen = await sql`
      INSERT INTO urunler (
        ad, reyon, gorsel, fiyat, eski_fiyat, miktar, birim, stokta, kaynak
      ) VALUES (
        ${urun.ad}, ${urun.reyon}, ${urun.gorsel}, ${urun.fiyat},
        ${urun.eskiFiyat}, ${urun.miktar}, ${urun.birim}, ${urun.stokta}, 'dukkan'
      )
      RETURNING id, ad, reyon, gorsel, fiyat, eski_fiyat, miktar, birim,
                stokta, kaynak, guncellendi
    `;

    const yeni = eklenen[0];
    console.log(
      `[DENETİM] Yeni ürün eklendi: id=${yeni.id} ("${yeni.ad}"), reyon="${yeni.reyon}", ` +
      `fiyat=₺${yeni.fiyat}, kullanıcı="${oturum.kullanici_adi}"`
    );

    tazele();

    return NextResponse.json(
      {
        eklendi: true,
        urun: urunYuku(yeni, true),
      },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    console.error("yonetici/urun POST başarısız:", (e as Error).message);
    return NextResponse.json(
      { hata: "Ürün eklenemedi" },   // ayrıntı günlükte; istemciye sürücü metni gitmez
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export async function DELETE(req: Request) {
  /* Content-Type kapısı, PATCH ve POST ile aynı — basit CSRF koruması.
     Tarayıcı başka bir kaynaktaki formdan JSON content-type'ıyla istek
     atamaz (preflight gerekir), düz form gönderimi buradan geçemez.
     Bu kapı DELETE'te yoktu; en yıkıcı uç en zayıf korunanıydı. */
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

    /* id YALNIZCA gövdeden. Sorgu dizesi desteği (?id=u005) kaldırıldı:
       silme adresi bağlantıya, geçmişe, sunucu günlüğüne ve Referer
       başlığına düşebilir hale geliyordu; üstelik Content-Type kapısını
       anlamsızlaştırıyordu, çünkü gövdesiz bir istek de silebiliyordu. */
    let id: string | null = null;
    try {
      const govde = await req.json();
      id = govde?.id ?? null;
    } catch {
      // gövde okunamadı; aşağıdaki kontrol 400 verecek
    }

    if (typeof id !== "string" || !id.trim()) {
      return NextResponse.json(
        { hata: "Ürün id'si gerekli" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const sql = sqlAl();

    /* Fiyat geçmişi ürüne ON DELETE CASCADE bağlı: ürünle birlikte o da
       gidiyor. Kaç kayıt gittiğini SİLMEDEN ÖNCE sayıyoruz ki hem denetim
       günlüğüne hem yanıta yazabilelim — sessizce yok olmasın. */
    const [{ gecmisAdet }] = await sql`
      SELECT count(*)::int AS "gecmisAdet"
        FROM fiyat_gecmisi WHERE urun_id = ${id.trim()}
    `;

    const silinenler = await sql`
      DELETE FROM urunler
       WHERE id = ${id.trim()}
      RETURNING id, ad, reyon, fiyat
    `;

    if (!silinenler || silinenler.length === 0) {
      return NextResponse.json(
        { hata: `"${id}" numaralı ürün bulunamadı` },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }

    const silinen = silinenler[0];
    console.log(
      `[DENETİM] Ürün silindi: id=${silinen.id} ("${silinen.ad}"), ` +
      `kullanıcı="${oturum.kullanici_adi}", birlikte silinen fiyat geçmişi=${gecmisAdet}`
    );

    tazele();

    return NextResponse.json(
      {
        silindi: true,
        id: silinen.id,
        ad: silinen.ad,
        silinenFiyatGecmisi: gecmisAdet,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    console.error("yonetici/urun DELETE başarısız:", (e as Error).message);
    return NextResponse.json(
      { hata: "Ürün silinemedi" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

