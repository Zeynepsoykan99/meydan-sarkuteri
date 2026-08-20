"use server";

import { revalidatePath } from "next/cache";
import { sqlAl } from "@/lib/veritabani";
import { oturumDogrula } from "@/lib/auth";
import { yeniUrunDogrula, urunYuku, type YeniUrunGirdisi } from "@/lib/yonetici";

/* =====================================================================
   Next.js 16 Server Actions:
   - urunEkleAction: Yeni ürün kaydetme
   - urunSilAction: Ürün silme
   ===================================================================== */

export async function urunEkleAction(girdi: YeniUrunGirdisi) {
  const oturum = await oturumDogrula();
  if (!oturum) {
    return { basarili: false, hata: "Oturum gerekli. Lütfen giriş yapın." };
  }

  try {
    const sql = sqlAl();
    const reyonlar = await sql`SELECT id FROM reyonlar`;
    const reyonIdleri = (reyonlar as { id: string }[]).map((r) => r.id);

    const { hatalar, urun } = yeniUrunDogrula(girdi, reyonIdleri);
    if (hatalar.length > 0) {
      return { basarili: false, hatalar, hata: hatalar[0] };
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
      `[ACTION] Yeni ürün eklendi: id=${yeni.id} ("${yeni.ad}"), kullanıcı="${oturum.kullanici_adi}"`
    );

    revalidatePath("/");
    revalidatePath("/panel");

    return {
      basarili: true,
      urun: urunYuku(yeni, true),
    };
  } catch (e) {
    console.error("urunEkleAction hatası:", (e as Error).message);
    return { basarili: false, hata: "Ürün eklenemedi: " + (e as Error).message };
  }
}

export async function urunSilAction(id: string) {
  const oturum = await oturumDogrula();
  if (!oturum) {
    return { basarili: false, hata: "Oturum gerekli. Lütfen giriş yapın." };
  }

  if (!id || typeof id !== "string") {
    return { basarili: false, hata: "Geçersiz ürün kimliği" };
  }

  try {
    const sql = sqlAl();
    const silinenler = await sql`
      DELETE FROM urunler
       WHERE id = ${id.trim()}
      RETURNING id, ad
    `;

    if (!silinenler || silinenler.length === 0) {
      return { basarili: false, hata: `"${id}" numaralı ürün bulunamadı` };
    }

    console.log(
      `[ACTION] Ürün silindi: id=${silinenler[0].id} ("${silinenler[0].ad}"), kullanıcı="${oturum.kullanici_adi}"`
    );

    revalidatePath("/");
    revalidatePath("/panel");

    return {
      basarili: true,
      id: silinenler[0].id,
      ad: silinenler[0].ad,
    };
  } catch (e) {
    console.error("urunSilAction hatası:", (e as Error).message);
    return { basarili: false, hata: "Ürün silinemedi: " + (e as Error).message };
  }
}
