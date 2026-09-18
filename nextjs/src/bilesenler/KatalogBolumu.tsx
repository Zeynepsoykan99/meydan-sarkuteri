"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KartVerisi, Reyon } from "@/lib/tipler";
import { indirimYuzde, sadelestir } from "@/lib/bicim";
import { DILIM_ARALIGI_MS, OTOMATIK_SINIR, SAYFA_BOYUTU, sayfaAdresi } from "@/lib/sayfalama";
import UrunKarti from "./UrunKarti";
import { useKatalogDurumu } from "./KatalogDurumu";

/* İstemci adası: arama, reyon, sıralama, indirim ve fiyat aralığı.

   Ürün listesi sunucudan prop olarak geliyor; bu bileşen sunucuda da
   çiziliyor (client bileşenleri SSR'lanıyor), yani ilk HTML 470 kartı
   içeriyor. Etkileşim hidrasyondan sonra başlıyor. */

/* Sayacın altındaki küçük eylem düğmeleri; "Sadece indirimliler" ile aynı kalıp. */
const CIP = `inline-flex min-h-11 items-center gap-2 rounded-full border-[1.5px] border-cizgi
             bg-beyaz px-4 py-2 text-[14.5px] font-semibold text-murekkep
             transition-colors hover:border-murekkep`;

type Siralama = "onerilen" | "ucuz" | "pahali" | "birim" | "indirim" | "isim";

export default function KatalogBolumu({
  urunler, reyonlar, sayfa, toplam,
}: {
  urunler: KartVerisi[];
  reyonlar: Reyon[];
  /** Adresten gelen sayfa numarası (1 tabanlı). */
  sayfa: number;
  /** Toplam sayfa sayısı — son sayfada "daha fazla" gösterilmesin diye. */
  toplam: number;
}) {
  /* reyon artık bağlamdan: şerit yapışkan başlıkta duruyor, burada değil. */
  const { arama, aramaYaz, reyon, reyonYaz, aramaSayilariYaz } = useKatalogDurumu();
  const [siralama, setSiralama] = useState<Siralama>("onerilen");
  const [indirimli, setIndirimli] = useState(false);
  const [enAz, setEnAz] = useState("");
  const [enCok, setEnCok] = useState("");

  /* Kaç ürün çiziliyor. Sunucu bu sayfanın 30'unu çizdi; ilk istemci
     durumu onunla AYNI olmalı, yoksa hidrasyon uyuşmazlığı çıkar. */
  const [adet, setAdet] = useState(SAYFA_BOYUTU);

  /* Hidrasyon oldu mu. "Daha fazla göster" bağlantısı sunucu çıktısında
     GÖRÜNÜR olmak zorunda: JavaScript kapalı ziyaretçinin tek ilerleme
     yolu o. Hidrasyondan sonra JavaScript devralıyor ve bağlantı ancak
     otomatik sınıra ulaşınca görünüyor. */
  const [hidre, setHidre] = useState(false);
  /* LINT: react-hooks/set-state-in-effect burada BİLEREK ihlal ediliyor.
     Kuralın amacı zincirleme render'ı önlemek; burada kastedilen şey tam
     olarak "sunucuda bir, istemcide başka" çizmek. Sunucu çıktısı JS'siz
     ziyaretçi için bağlantıyı GÖRÜNÜR vermek zorunda, hidrasyondan sonra
     onu gizliyoruz. Bu bilgi render sırasında okunamaz (okunsaydı sunucu
     ve istemci aynı sonucu üretir, hidrasyon uyuşmazlığı çıkardı), tek
     doğru yer effect. Bir kez çalışıyor, bağımlılığı boş. */
  useEffect(() => setHidre(true), []);

  const reyonAdlari = useMemo(
    () => new Map(reyonlar.map((r) => [r.id, r.ad])), [reyonlar]);

  // Arama dizini bir kez kuruluyor; her tuşta yeniden hesaplanmıyor
  const dizin = useMemo(
    () => new Map(urunler.map((u) => [u.id, sadelestir(`${u.ad} ${reyonAdlari.get(u.reyon) ?? ""}`)])),
    [urunler, reyonAdlari]);

  const kelimeler = useMemo(
    () => sadelestir(arama).split(/\s+/).filter(Boolean), [arama]);

  /* Reyon DIŞINDAKİ bütün süzgeçler (arama, indirim, fiyat). Reyon ayrı
     tutuluyor çünkü "bütün reyonlarda ara (N)" düğmesi N'yi reyonsuz
     hesaplıyor — düğmeye basınca liste tam o sayıyı göstermeli. */
  const reyonsuzUyan = useMemo(() => {
    const az = enAz === "" ? null : Number(enAz);
    const cok = enCok === "" ? null : Number(enCok);
    return urunler.filter((u) => {
      if (indirimli && !u.eskiFiyat) return false;
      if (az !== null && u.fiyat < az) return false;
      if (cok !== null && u.fiyat > cok) return false;
      const metin = dizin.get(u.id) ?? "";
      return kelimeler.every((k) => metin.includes(k));
    });
  }, [urunler, dizin, kelimeler, indirimli, enAz, enCok]);

  /* Şerit rozetleri için reyon başına YALNIZCA aramaya uyan sayı.
     İndirim ve fiyat süzgeci burada yok: rozetin anlamı "bu reyonda bu
     aramanın kaç sonucu var" — o iki süzgeç katalog başlığının altında,
     şeritten uzakta duruyor ve rozeti onlara bağlamak sayının neden
     değiştiğini görünmez kılardı. Arama yokken null: rozet toplamı
     gösteriyor. */
  const aramaSayilari = useMemo(() => {
    if (kelimeler.length === 0) return null;
    const say: Record<string, number> = { hepsi: 0 };
    for (const u of urunler) {
      const metin = dizin.get(u.id) ?? "";
      if (!kelimeler.every((k) => metin.includes(k))) continue;
      say.hepsi++;
      say[u.reyon] = (say[u.reyon] ?? 0) + 1;
    }
    return say;
  }, [urunler, dizin, kelimeler]);

  /* Sayıları şeride bildir. Şerit layout'ta, ayrı ağaçta; ürün verisi
     burada — bağlam tek köprü. useLayoutEffect: boyamadan önce çalışıyor,
     yani liste ile rozetin farklı sayı gösterdiği bir kare hiç çizilmiyor.
     Katalog sökülünce (ürün sayfasına geçiş) rozet toplamlara dönüyor. */
  useLayoutEffect(() => { aramaSayilariYaz(aramaSayilari); }, [aramaSayilari, aramaSayilariYaz]);
  useLayoutEffect(() => () => aramaSayilariYaz(null), [aramaSayilariYaz]);

  const liste = useMemo(() => {
    const suzulmus = reyon === "hepsi"
      ? reyonsuzUyan
      : reyonsuzUyan.filter((u) => u.reyon === reyon);

    const kural: Record<Siralama, (a: KartVerisi, b: KartVerisi) => number> = {
      onerilen: () => 0,
      ucuz: (a, b) => a.fiyat - b.fiyat,
      pahali: (a, b) => b.fiyat - a.fiyat,
      // Önce ağırlık/hacim (kıyaslanabilir), sonra adet, en sonda birimsizler
      birim: (a, b) => a.bfGrup - b.bfGrup || a.bfDeger - b.bfDeger,
      // Eşit indirim oranında ucuz olan önce — yoksa sıra rastgele kalıyor
      indirim: (a, b) => indirimYuzde(b) - indirimYuzde(a) || a.fiyat - b.fiyat,
      isim: (a, b) => a.ad.localeCompare(b.ad, "tr"),
    };

    /* Stokta olmayanlar HANGİ sıralama seçilirse seçilsin en sona.
       Tezgâhta olmayan ürünün listenin başında durması, ziyaretçiye
       alamayacağı şeyi öneriyor. Sort kararlı olduğu için "onerilen"de
       geri kalanların veri sırası korunuyor. */
    const stokSonra = (a: KartVerisi, b: KartVerisi) =>
      Number(!a.stokta) - Number(!b.stokta);

    return [...suzulmus].sort((a, b) => stokSonra(a, b) || kural[siralama](a, b));
  }, [reyonsuzUyan, reyon, siralama]);

  const bos = liste.length === 0;

  /* SÜZGEÇ ETKİN Mİ. Etkinse sayfalama devre dışı: eşleşen her ürün
     gösteriliyor. Süzen ziyaretçi belirli bir şey arıyor; sonucu
     kaydırmanın arkasına saklamak ona yardım etmez. */
  const suzgecEtkin =
    arama.trim() !== "" || reyon !== "hepsi" || indirimli ||
    enAz !== "" || enCok !== "" || siralama !== "onerilen";

  const dilimBasi = (sayfa - 1) * SAYFA_BOYUTU;
  const gorunen = suzgecEtkin ? liste : liste.slice(dilimBasi, dilimBasi + adet);

  /* Otomatik yükleme: listenin sonundaki nöbetçi görünür olunca 30 ekle.
     OTOMATIK_SINIR'a ulaşınca duruyor — sonsuz kaydırma, ziyaretçiyi
     altbilgiye hiç ulaştırmadığı için bilerek sınırlı. */
  const nobetci = useRef<HTMLDivElement | null>(null);
  /* Son yükleme anı — dilimler arasındaki en kısa süreyi bunun üzerinden
     uyguluyoruz. Ziyaretçi sayfanın sonuna sabitlendiğinde tarayıcı onu
     orada tutuyor (scroll anchoring) ve nöbetçi görünürde kalıyor; sınır
     olmadan tek kaydırmada 30'dan 150'ye atlıyordu (ölçüldü). */
  const sonYukleme = useRef(0);

  const otomatikBitti = adet >= OTOMATIK_SINIR;
  const dahaVar = !suzgecEtkin && dilimBasi + adet < liste.length;

  /* NEDEN IntersectionObserver DEĞİL — ölçülmüş bir kusur:

     Önce nöbetçiyi IntersectionObserver ile izliyorduk. IO yalnızca
     kesişim durumu DEĞİŞİNCE haber verir. Sayfa sonuna tek hamlede
     atlandığında (mobil ivmeli kaydırma, End tuşu, geri gezinmede geri
     yüklenen kaydırma konumu) nöbetçi "kesişmiyor"dan yine
     "kesişmiyor"a geçiyor — arada hiçbir kare örneklenmediği için geri
     çağrı HİÇ çalışmıyor ve otomatik yükleme sessizce ölüyordu.

     Bunun görünür olup olmaması ızgaranın ALTINDAKİ kuyruğa bağlıydı:
     dükkân bölümleri + altbilgi 390px'te 1477px, 1280px'te 969px.
     rootMargin 300px'ti; 1280'de nöbetçi sınırın içinde kalıp çalışıyor,
     390'da 633px yukarıda kalıp çalışmıyordu. Yani özellik masaüstünde
     çalışıp mobilde çalışmıyordu — ve mahalle şarküterisinin kitlesi
     mobil.

     Yerine konum denetimi: nöbetçi görünür alanın altından yukarıda mı?
     Bu ölçüm tek karede doğru sonucu verir, atlanamaz. Kaydırma
     dinleyicisi passive; ayrıca her dilimden sonra bir kez daha
     bakıyoruz ki derine düşen ziyaretçi (geri gezinme) takılıp
     kalmasın. */
  const ONYUKLEME_PX = 300;   // ekrana girmeden az önce hazırla

  useEffect(() => {
    if (suzgecEtkin || otomatikBitti || !dahaVar) return;
    const hedef = nobetci.current;
    if (!hedef) return;

    let bitti = false;
    const bak = () => {
      if (bitti) return;
      if (Date.now() - sonYukleme.current < DILIM_ARALIGI_MS) return;
      /* top, görünür alanın altından yukarıdaysa nöbetçiye ulaşılmış
         demektir. Negatif değerler de (nöbetçi ekranın üstünde kaldı)
         bu koşulu sağlıyor — atlanan sıçramayı yakalayan kısım burası. */
      if (hedef.getBoundingClientRect().top > window.innerHeight + ONYUKLEME_PX) return;
      bitti = true;
      sonYukleme.current = Date.now();
      setAdet((n) => Math.min(n + SAYFA_BOYUTU, OTOMATIK_SINIR));
    };

    /* Dilim geldikten sonra bir kez daha bak: ziyaretçi hâlâ nöbetçinin
       ötesindeyse sıradaki dilim gelsin, ama DILIM_ARALIGI_MS kadar
       bekleyerek — "30'ar ekleniyor" gözle görülür kalsın diye. */
    const z = window.setTimeout(bak, DILIM_ARALIGI_MS + 50);
    window.addEventListener("scroll", bak, { passive: true });
    window.addEventListener("resize", bak, { passive: true });
    bak();
    return () => {
      window.clearTimeout(z);
      window.removeEventListener("scroll", bak);
      window.removeEventListener("resize", bak);
    };
  }, [suzgecEtkin, otomatikBitti, dahaVar, adet]);

  /* Süzgeç açılıp kapandığında sayfalama başa dönsün — yoksa süzgeci
     kaldıran ziyaretçi, önceden açtığı 150 ürünle karşılaşır.

     LINT: react-hooks/set-state-in-effect burada da BİLEREK ihlal
     ediliyor. Sıfırlama bir GEÇİŞE tepki: "süzgeç vardı, artık yok".
     Render sırasında türetilemez, çünkü suzgecEtkin'in önceki değerini
     bilmek gerekiyor. Süzgeci değiştiren her yere elle setAdet(30)
     serpiştirmek alternatifti; tek bir yerde toplamak yerine altı ayrı
     çağrı bırakırdı ve biri unutulduğunda sessizce bozulurdu. */
  useEffect(() => {
    if (!suzgecEtkin) setAdet(SAYFA_BOYUTU);
  }, [suzgecEtkin]);

  /* ARAMA YA DA REYON DEĞİŞİNCE KATALOĞU GÖSTER.

     Katalog ilk ekranın çok altında: vitrin ve düşen etiketler onu
     375px'te 2083px, 1280px'te 1480px aşağı itiyor (ölçüldü). Süzgeç
     değişince hiçbir şey kaydırmadığı için ziyaretçi sonucu hiç
     görmüyordu; listenin derinindeyken reyon seçince de kısalan listenin
     dışına, altbilgiye düşüyordu.

     Hedef ilk kart değil BÖLÜMÜN BAŞI (başlık + sayaç): sayaç "Fırından
     reyonunda 'çikolata' için 2 ürün" diyor, sonucun neden az olduğunu
     o satır anlatıyor. Yapışkan başlığın altında durması globals.css'teki
     scroll-margin payı ile sağlanıyor ("İçeriğe atla" da aynı yere
     gidiyor). Hizalı mı sorusunda kabın scroll-padding'i de hesaba
     katılıyor: tarayıcı ikisini TOPLAYARAK uyguluyor (ikisi birden
     144px iken başlık 288px'e iniyordu — ölçüldü).

     Kural "hizalı değilse hizala": ilk harfte bir kez kayıyor, sonraki
     tuşlarda başlık zaten yerinde olduğu için hiç kıpırdamıyor. Arama
     kutusu yapışkan başlıkta, yani kayarken odak ve kutu ekranda kalıyor.
     Aramayı temizlemek de bir değişiklik: 471 ürünlük listenin başına.

     İlk yükleme bir değişiklik DEĞİL — önceki değer bağlamdaki değerle
     başlıyor, ilk çalıştırma hiçbir şey yapmıyor. Ürün sayfasından reyona
     basınca /#katalog adresi kendisi götürüyor.

     Olay işleyicilerinde değil burada: aramayı, reyonu ve boş durumdaki
     düğmeleri değiştiren dört ayrı yer var; biri unutulursa sessizce
     bozulurdu. */
  const bolum = useRef<HTMLElement | null>(null);
  const oncekiSuzgec = useRef({ arama, reyon });
  useEffect(() => {
    const o = oncekiSuzgec.current;
    if (o.arama === arama && o.reyon === reyon) return;
    oncekiSuzgec.current = { arama, reyon };

    const el = bolum.current;
    if (!el) return;
    const hedef =
      (parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0) +
      (parseFloat(getComputedStyle(el).scrollMarginTop) || 0);
    if (Math.abs(el.getBoundingClientRect().top - hedef) < 2) return;
    const hareketsiz = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "start", behavior: hareketsiz ? "auto" : "smooth" });
  }, [arama, reyon]);

  const reyonAdi = reyon === "hepsi" ? null : reyonAdlari.get(reyon);
  const tumReyonlardaAdet = reyonsuzUyan.length;
  const q = arama.trim();

  /* "Daha fazla göster" adresi: gösterilen son dilimden SONRAKİ sayfa. */
  const sonrakiSayfa = Math.floor((dilimBasi + adet) / SAYFA_BOYUTU) + 1;

  return (
    <section ref={bolum} className="katalog py-11 md:py-16" id="katalog">
      <div className="kucak">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 max-w-full">
            <h2 className="text-[clamp(26px,4vw,36px)]">
              {reyon === "hepsi" ? "Bütün reyonlar" : reyonAdlari.get(reyon)}
            </h2>
            <p className="mt-1.5 text-murekkep-soluk [overflow-wrap:anywhere]" aria-live="polite" aria-atomic="true"
               data-sayac="">
              {q && reyonAdi
                ? `${reyonAdi} reyonunda "${q}" için ${liste.length} ürün bulundu.`
                : q
                  ? `"${q}" için ${liste.length} ürün bulundu.`
                  : `${liste.length} ürün listeleniyor.`}
            </p>

            {/* Arama + reyon birlikte: ikisinin de açıkça görünmesi ve tek
                dokunuşla ayrılabilmesi. "Fırından 22 ürün" beklerken 2
                ürün gören ziyaretçi, reyonun açılmadığını sanıyordu. */}
            {q && (
              <div className="mt-3 flex flex-wrap gap-2">
                {reyonAdi && (
                  <button type="button" data-eylem="tum-reyonlarda-ara"
                          onClick={() => reyonYaz("hepsi")} className={CIP}>
                    Bütün reyonlarda ara
                    <span className="text-murekkep-soluk">({tumReyonlardaAdet})</span>
                  </button>
                )}
                <button type="button" data-eylem="aramayi-kaldir"
                        onClick={() => aramaYaz("")}
                        className={`${CIP} max-w-full text-left [overflow-wrap:anywhere]`}>
                  <span aria-hidden="true">✕</span> &ldquo;{q}&rdquo; aramasını kaldır
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button" aria-pressed={indirimli}
              onClick={() => setIndirimli((v) => !v)}
              className={`inline-flex min-h-11 items-center gap-2 rounded-full border-[1.5px]
                          px-4 py-2 text-[14.5px] font-semibold transition-colors ${
                indirimli
                  ? "border-kirmizi bg-kirmizi text-beyaz"
                  : "border-cizgi bg-beyaz text-murekkep hover:border-murekkep"
              }`}
            >
              <span aria-hidden="true">🏷️</span> Sadece indirimliler
            </button>

            <div role="group" aria-label="Fiyat aralığı"
                 className="flex items-center gap-1.5 rounded-full border-[1.5px] border-cizgi
                            bg-beyaz px-3 py-1.5">
              <input type="number" min={0} step={1} inputMode="numeric" placeholder="En az ₺"
                     aria-label="En düşük fiyat" value={enAz}
                     onChange={(e) => setEnAz(e.target.value)}
                     className="min-h-11 w-[86px] bg-transparent py-1.5 text-[14.5px] outline-none" />
              <span aria-hidden="true" className="text-murekkep-soluk">–</span>
              <input type="number" min={0} step={1} inputMode="numeric" placeholder="En çok ₺"
                     aria-label="En yüksek fiyat" value={enCok}
                     onChange={(e) => setEnCok(e.target.value)}
                     className="min-h-11 w-[86px] bg-transparent py-1.5 text-[14.5px] outline-none" />
            </div>

            <label className="flex items-center gap-2 text-[14.5px] text-murekkep-soluk">
              <span>Sırala</span>
              <select
                value={siralama}
                onChange={(e) => setSiralama(e.target.value as Siralama)}
                className="min-h-11 rounded-full border-[1.5px] border-cizgi bg-beyaz px-3.5
                           text-[14.5px] font-semibold text-murekkep"
              >
                <option value="onerilen">Reyon sırası</option>
                <option value="ucuz">Artan fiyat</option>
                <option value="pahali">Azalan fiyat</option>
                <option value="birim">Birim fiyat (artan)</option>
                <option value="indirim">En çok indirim</option>
                <option value="isim">İsme göre (A–Z)</option>
              </select>
            </label>
          </div>
        </div>

        {bos ? (
          <div className="rounded-buyuk border-2 border-dashed border-cizgi px-5 py-12 text-center">
            <p className="font-display text-xl font-extrabold">Tezgâhta bulamadık.</p>
            <p className="mt-2 text-murekkep-soluk [overflow-wrap:anywhere]" data-bos-aciklama="">
              {q && reyonAdi
                ? tumReyonlardaAdet > 0
                  ? `${reyonAdi} reyonunda "${q}" yok, ama bütün reyonlarda ${tumReyonlardaAdet} ürün var.`
                  : `"${q}" hiçbir reyonda yok. Başka bir kelime dene.`
                : q
                  ? `"${q}" için sonuç yok. Başka bir kelime dene ya da süzgeçleri sıfırla.`
                  : "Bu süzgeçlere uyan ürün yok."}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              {q && reyonAdi && tumReyonlardaAdet > 0 && (
                <button type="button" data-eylem="tum-reyonlarda-ara"
                        onClick={() => reyonYaz("hepsi")} className="dugme dugme-dolu">
                  Bütün reyonlarda ara ({tumReyonlardaAdet})
                </button>
              )}
              {/* Aramayı da temizliyor. Önceden temizlemiyordu: "sıfırla"ya
                  basan ziyaretçi 471 değil yine aramanın sonucunu görüyordu. */}
              <button
                type="button" data-eylem="sifirla"
                onClick={() => {
                  aramaYaz(""); reyonYaz("hepsi");
                  setIndirimli(false); setEnAz(""); setEnCok("");
                }}
                className={`dugme ${q && reyonAdi && tumReyonlardaAdet > 0 ? "dugme-hat" : "dugme-dolu"}`}
              >
                Filtreleri sıfırla
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="izgara">
              {gorunen.map((u, i) => (
                <UrunKarti
                  key={u.id}
                  u={u}
                  reyonAdi={reyonAdlari.get(u.reyon)}
                  reyonGoster={reyon === "hepsi"}
                  oncelikli={i < 4}
                />
              ))}
            </div>

            {/* Otomatik yükleme nöbetçisi — görünürlüğü tetikleyici */}
            {!suzgecEtkin && dahaVar && !otomatikBitti && (
              <div ref={nobetci} aria-hidden="true" className="h-px" />
            )}

            {/* GERÇEK BAĞLANTI. Sunucu çıktısında görünür durumda geliyor:
                JavaScript kapalıyken tek ilerleme yolu bu, arama motoru da
                bunu izliyor. Hidrasyondan sonra yalnızca otomatik sınıra
                ulaşıldığında görünüyor. */}
            {!suzgecEtkin && dahaVar && (!hidre || otomatikBitti) && (
              <div className="mt-9 flex justify-center">
                <a
                  href={sayfaAdresi(sonrakiSayfa)}
                  className="dugme dugme-hat"
                  onClick={(e) => {
                    /* JavaScript varken adrese gitmiyoruz: veri zaten
                       istemcide, 30 ürün daha çizmek yeterli. Bağlantı
                       gerçek kalıyor — orta tık, "yeni sekmede aç" ve
                       JavaScript kapalı ziyaretçi için. */
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                    e.preventDefault();
                    setAdet((n) => n + SAYFA_BOYUTU);
                  }}
                >
                  Daha fazla göster
                  <span className="text-murekkep-soluk">
                    ({Math.min(dilimBasi + adet, liste.length)} / {liste.length})
                  </span>
                </a>
              </div>
            )}

            {/* Sayfa gezinmesi — JavaScript kapalıyken ve arama motoru
                için. Hidrasyondan sonra gizleniyor; JavaScript varken
                ilerleme kaydırma ve düğmeyle oluyor. */}
            {!suzgecEtkin && !hidre && toplam > 1 && (
              <nav aria-label="Sayfalar" className="mt-6 flex justify-center gap-3 text-[14.5px]">
                {sayfa > 1 && (
                  <a href={sayfaAdresi(sayfa - 1)} className="min-h-11 inline-flex items-center px-3">
                    ← Önceki sayfa
                  </a>
                )}
                <span className="min-h-11 inline-flex items-center px-3 text-murekkep-soluk">
                  Sayfa {sayfa} / {toplam}
                </span>
                {sayfa < toplam && (
                  <a href={sayfaAdresi(sayfa + 1)} className="min-h-11 inline-flex items-center px-3">
                    Sonraki sayfa →
                  </a>
                )}
              </nav>
            )}
          </>
        )}
      </div>
    </section>
  );
}
