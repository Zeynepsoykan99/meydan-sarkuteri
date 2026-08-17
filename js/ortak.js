/* =====================================================================
   Ana site ile panelin paylaştığı küçük yardımcılar.

   Bunlar iki yerde de gerekiyordu; kopyalamak yerine buraya alındı.
   Özellikle arama sadeleştirmesi: iki tarafta ayrışırsa panelde
   bulunan ürün ana sitede bulunamaz hale gelir.

   Klasik <script> ile yükleniyor (modül değil) — proje derlenmeden
   servis ediliyor ve öyle kalsın istiyoruz.
   ===================================================================== */

window.Ortak = (function () {
  'use strict';

  /* Türkçe arama: ı/i, ş/s, ğ/g farkları aramayı bozmasın.
     "cikolata" yazan da "Çikolata"yı bulsun. */
  const sadelestir = (s) => String(s)
    .toLocaleLowerCase('tr')
    .replace(/[ıîi̇]/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .trim();

  /* HTML kaçışı — innerHTML'e giden her dinamik değer buradan geçer. */
  const kacar = (s) => String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  const paraBicim = new Intl.NumberFormat('tr-TR', {
    style: 'currency', currency: 'TRY', minimumFractionDigits: 2,
  });
  const para = (n) => paraBicim.format(n);

  /* Türkçe klavyede ondalık ayracı virgül. Panelde "39,5" de "39.5" de
     kabul ediliyor; sunucuya her zaman nokta ile gidiyor.
     Boş dize null döndürür — "değer girilmedi" ile "sıfır" farklı. */
  function sayiyaCevir(metin) {
    if (typeof metin !== 'string') return null;
    const temiz = metin.trim().replace(/\s/g, '').replace(',', '.');
    if (temiz === '') return null;
    if (!/^\d*\.?\d+$/.test(temiz)) return NaN;   // geçersiz: çağıran karar versin
    return Number(temiz);
  }

  return { sadelestir, kacar, para, sayiyaCevir };
})();
