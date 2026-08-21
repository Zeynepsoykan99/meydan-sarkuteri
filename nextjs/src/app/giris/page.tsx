"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const ASGARI_PAROLA = 12;

export default function GirisSayfasi() {
  const router = useRouter();
  const [durum, setDurum] = useState<"yukleniyor" | "giris" | "degistir">("giris");
  const [kullaniciAdi, setKullaniciAdi] = useState("");
  const [parola, setParola] = useState("");
  const [mevcutSifre, setMevcutSifre] = useState("");
  const [yeniSifre, setYeniSifre] = useState("");
  const [yeniSifreTekrar, setYeniSifreTekrar] = useState("");
  const [hata, setHata] = useState<string | null>(null);
  const [islemde, setIslemde] = useState(false);

  useEffect(() => {
    async function oturumKontrol() {
      try {
        const res = await fetch("/api/oturum", { cache: "no-store" });
        const veri = await res.json();
        if (veri?.girisli) {
          if (veri.sifreDegistirmeli) {
            setKullaniciAdi(veri.kullaniciAdi ?? "");
            setDurum("degistir");
          } else {
            router.replace("/panel");
          }
          return;
        }
      } catch {
        // Hata durumunda giriş formunu göster
      }
      setDurum("giris");
    }

    oturumKontrol();
  }, [router]);

  async function handleGiris(e: React.FormEvent) {
    e.preventDefault();
    setHata(null);

    const kAdi = kullaniciAdi.trim();
    if (!kAdi || !parola) {
      setHata("Kullanıcı adı ve şifre gerekli.");
      return;
    }

    setIslemde(true);
    try {
      const res = await fetch("/api/giris", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kullaniciAdi: kAdi, parola }),
      });
      const veri = await res.json();

      if (res.ok && veri.girisli) {
        setParola("");
        if (veri.sifreDegistirmeli) {
          setDurum("degistir");
        } else {
          router.replace("/panel");
        }
        return;
      }

      setHata(veri?.hata ?? "Kullanıcı adı veya şifre hatalı");
    } catch {
      setHata("Bağlantı kurulamadı. Tekrar deneyin.");
    } finally {
      setIslemde(false);
    }
  }

  async function handleSifreDegistir(e: React.FormEvent) {
    e.preventDefault();
    setHata(null);

    if (yeniSifre.length < ASGARI_PAROLA) {
      setHata(`Yeni şifre en az ${ASGARI_PAROLA} karakter olmalı.`);
      return;
    }
    if (yeniSifre !== yeniSifreTekrar) {
      setHata("Yeni şifreler eşleşmiyor.");
      return;
    }
    if (yeniSifre === mevcutSifre) {
      setHata("Yeni şifre mevcut şifreyle aynı olamaz.");
      return;
    }

    setIslemde(true);
    try {
      const res = await fetch("/api/sifre-degistir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mevcutSifre, yeniSifre }),
      });
      const veri = await res.json();

      if (res.ok && veri.degisti) {
        setMevcutSifre("");
        setYeniSifre("");
        setYeniSifreTekrar("");
        router.replace("/panel");
        return;
      }

      setHata(veri?.hata ?? "Şifre değiştirilemedi.");
    } catch {
      setHata("Bağlantı kurulamadı. Tekrar deneyin.");
    } finally {
      setIslemde(false);
    }
  }

  return (
    <div className="grid min-h-[calc(100dvh-10px)] place-items-center bg-tezgah px-5 py-6 sm:py-12">
      <div className="w-full max-w-[420px] rounded-buyuk border-[3px] border-murekkep bg-beyaz p-6 shadow-[8px_10px_0_rgb(27_25_23/0.9)] sm:p-8">
        <Link href="/" className="mb-5 flex items-center gap-[11px] text-inherit no-underline">
          <span
            className="grid size-[42px] place-items-center rounded-[11px] bg-kirmizi
                       font-display text-2xl font-extrabold text-sari
                       shadow-[inset_0_-3px_0_rgb(0_0_0/0.16)]"
            aria-hidden="true"
          >
            M
          </span>
          <span className="flex flex-col leading-none">
            <strong className="font-display text-[22px] font-extrabold tracking-[-0.03em]">
              Meydan
            </strong>
            <em className="mt-[3px] text-[10.5px] font-semibold not-italic uppercase tracking-[0.26em] text-kirmizi">
              Şarküteri
            </em>
          </span>
        </Link>

        {durum === "yukleniyor" && (
          <p className="py-16 text-center text-murekkep-soluk" role="status">
            Kontrol ediliyor…
          </p>
        )}

        {durum === "giris" && (
          <form onSubmit={handleGiris} className="space-y-4">
            <div>
              <h1 className="text-[clamp(24px,5vw,30px)]">Tezgâh yönetimi</h1>
              <p className="mt-1 text-[15px] text-murekkep-soluk">Devam etmek için giriş yapın.</p>
            </div>

            {hata && (
              <p className="rounded-orta border-[1.5px] border-kirmizi bg-kirmizi-sis p-3 text-[14.5px] font-semibold text-kirmizi-koyu" role="alert">
                {hata}
              </p>
            )}

            <div>
              <label className="block text-[13px] font-bold uppercase tracking-[0.06em] text-murekkep-soluk" htmlFor="kullanici">
                Kullanıcı adı
              </label>
              <input
                id="kullanici"
                name="username"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                value={kullaniciAdi}
                onChange={(e) => setKullaniciAdi(e.target.value)}
                className="mt-1.5 min-h-12 w-full rounded-orta border-[1.5px] border-cizgi bg-tezgah px-3.5 py-3 text-[16px] text-murekkep outline-none transition-colors focus:border-murekkep focus:bg-beyaz focus-visible:outline focus-visible:outline-3 focus-visible:outline-sari"
              />
            </div>

            <div>
              <label className="block text-[13px] font-bold uppercase tracking-[0.06em] text-murekkep-soluk" htmlFor="sifre">
                Şifre
              </label>
              <input
                id="sifre"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={parola}
                onChange={(e) => setParola(e.target.value)}
                className="mt-1.5 min-h-12 w-full rounded-orta border-[1.5px] border-cizgi bg-tezgah px-3.5 py-3 text-[16px] text-murekkep outline-none transition-colors focus:border-murekkep focus:bg-beyaz focus-visible:outline focus-visible:outline-3 focus-visible:outline-sari"
              />
            </div>

            <button
              type="submit"
              disabled={islemde}
              className="dugme dugme-dolu w-full min-h-[52px] text-[16px]"
            >
              {islemde ? "Giriş yapılıyor…" : "Giriş yap"}
            </button>
          </form>
        )}

        {durum === "degistir" && (
          <form onSubmit={handleSifreDegistir} className="space-y-4">
            <div>
              <h1 className="text-[clamp(24px,5vw,30px)]">Şifrenizi belirleyin</h1>
              <p className="mt-1 text-[15px] text-murekkep-soluk">
                Geçici şifreyle girdiniz. Devam etmek için yeni bir şifre belirlemeniz gerekiyor.
              </p>
            </div>

            {hata && (
              <p className="rounded-orta border-[1.5px] border-kirmizi bg-kirmizi-sis p-3 text-[14.5px] font-semibold text-kirmizi-koyu" role="alert">
                {hata}
              </p>
            )}

            <div>
              <label className="block text-[13px] font-bold uppercase tracking-[0.06em] text-murekkep-soluk" htmlFor="mevcut-sifre">
                Geçici şifre
              </label>
              <input
                id="mevcut-sifre"
                name="current-password"
                type="password"
                autoComplete="current-password"
                required
                value={mevcutSifre}
                onChange={(e) => setMevcutSifre(e.target.value)}
                className="mt-1.5 min-h-12 w-full rounded-orta border-[1.5px] border-cizgi bg-tezgah px-3.5 py-3 text-[16px] text-murekkep outline-none transition-colors focus:border-murekkep focus:bg-beyaz focus-visible:outline focus-visible:outline-3 focus-visible:outline-sari"
              />
            </div>

            <div>
              <label className="block text-[13px] font-bold uppercase tracking-[0.06em] text-murekkep-soluk" htmlFor="yeni-sifre">
                Yeni şifre
              </label>
              <input
                id="yeni-sifre"
                name="new-password"
                type="password"
                autoComplete="new-password"
                minLength={ASGARI_PAROLA}
                required
                value={yeniSifre}
                onChange={(e) => setYeniSifre(e.target.value)}
                className="mt-1.5 min-h-12 w-full rounded-orta border-[1.5px] border-cizgi bg-tezgah px-3.5 py-3 text-[16px] text-murekkep outline-none transition-colors focus:border-murekkep focus:bg-beyaz focus-visible:outline focus-visible:outline-3 focus-visible:outline-sari"
              />
              <p className="mt-1 text-[13px] text-murekkep-soluk">En az 12 karakter.</p>
            </div>

            <div>
              <label className="block text-[13px] font-bold uppercase tracking-[0.06em] text-murekkep-soluk" htmlFor="yeni-sifre-tekrar">
                Yeni şifre (tekrar)
              </label>
              <input
                id="yeni-sifre-tekrar"
                name="new-password"
                type="password"
                autoComplete="new-password"
                minLength={ASGARI_PAROLA}
                required
                value={yeniSifreTekrar}
                onChange={(e) => setYeniSifreTekrar(e.target.value)}
                className="mt-1.5 min-h-12 w-full rounded-orta border-[1.5px] border-cizgi bg-tezgah px-3.5 py-3 text-[16px] text-murekkep outline-none transition-colors focus:border-murekkep focus:bg-beyaz focus-visible:outline focus-visible:outline-3 focus-visible:outline-sari"
              />
            </div>

            <button
              type="submit"
              disabled={islemde}
              className="dugme dugme-dolu w-full min-h-[52px] text-[16px]"
            >
              {islemde ? "Değiştiriliyor…" : "Şifreyi değiştir ve devam et"}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-[14.5px]">
          <Link href="/" className="text-murekkep-soluk no-underline hover:text-kirmizi">
            ← Katalog sayfasına dön
          </Link>
        </p>
      </div>
    </div>
  );
}
