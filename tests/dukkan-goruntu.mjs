/* C4 — 375px ekran görüntüsü: dolduruldu:true + gerçekçi örnek veri. */
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';

const B = process.env.ADRES || 'http://localhost:3000';
const KOK = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '');
const VERI = `${KOK}/data/dukkan.json`;
const CIKTI = `${KOK}/.gorsel`;
const OZGUN = readFileSync(VERI);

const v = JSON.parse(OZGUN.toString('utf8'));
v.dolduruldu = true;
v.ad = 'Meydan Şarküteri';
v.adres = { satir: 'Cumhuriyet Meydanı No: 7', ilce: 'Karşıyaka', il: 'İzmir',
            haritaUrl: 'https://maps.google.com/?q=Cumhuriyet+Meydani+No+7+Karsiyaka+Izmir' };
v.iletisim = { telefon: '+90 232 123 45 67', whatsapp: '+90 555 123 45 67' };
v.siparis = { var: true, yontem: 'whatsapp',
              aciklama: 'WhatsApp’tan yazın, hazırlayıp haber verelim.',
              teslimat: 'Mahalle içi 150 TL üzeri ücretsiz teslimat.' };
writeFileSync(VERI, JSON.stringify(v, null, 2), 'utf8');

const t = await chromium.launch({ executablePath: process.env.CHROME_YOLU || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  // 1050px yükseklik: 943px'lik bölüm tek karede sığsın (genişlik gerçek telefon)
  const c = await t.newContext({ viewport: { width: 375, height: 1260 } });
  const s = await c.newPage();
  await s.goto(B, { waitUntil: 'networkidle', timeout: 60000 });
  await s.waitForTimeout(1200);

  // Bütün görseller yerleşsin, yoksa kaydırdıktan sonra sayfa oynuyor
  await s.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await s.waitForTimeout(1500);
  await s.evaluate(() => window.scrollTo(0, 0));
  await s.waitForTimeout(600);

  // Sayfanın başındayken: şerit hem kendi başına hem sayfa bağlamında
  await s.screenshot({ path: `${CIKTI}/telefon-dukkan-ust.png` });
  const serit = await s.$('#dukkan-serit');
  await serit.screenshot({ path: `${CIKTI}/telefon-dukkan-serit.png` });
  console.log('şerit:', await s.evaluate(() => document.querySelector('.serit-durum')?.textContent.replace(/\s+/g, ' ').trim()));

  /* Tembel görseller indikçe sayfa uzuyor, tek kaydırma tutmuyor.
     Bölüm görüntü alanına oturana kadar tekrar hizalıyoruz. */
  let ust = null;
  for (let i = 0; i < 8; i++) {
    await s.evaluate(() => {
      const b = document.getElementById('dukkan').getBoundingClientRect().top + window.scrollY;
      const h = document.querySelector('.baslik').getBoundingClientRect().height;
      window.scrollTo(0, b - h - 8);
    });
    await s.waitForTimeout(600);
    ust = await s.evaluate(() =>
      Math.round(document.getElementById('dukkan').getBoundingClientRect().top));
    if (ust >= 0 && ust <= 120) break;
  }
  console.log('bölümün görüntü alanındaki üst kenarı:', ust, 'px');
  await s.screenshot({ path: `${CIKTI}/telefon-dukkan-bolumu.png` });
  const bilgi = await s.evaluate(() => {
    const e = document.getElementById('dukkan');
    return { h: Math.round(e.getBoundingClientRect().height),
             kutu: [...e.querySelectorAll('.dukkan-kutu h3')].map(x => x.textContent) };
  });
  console.log('bölüm yüksekliği:', bilgi.h, 'px | kutular:', bilgi.kutu.join(', '));

  console.log('görüntüler:', `${CIKTI}/telefon-dukkan-{serit,bolumu,ust}.png`);
  await c.close();
} finally {
  writeFileSync(VERI, OZGUN);
  console.log(readFileSync(VERI).equals(OZGUN) ? 'dukkan.json geri kondu' : 'GERİ KONAMADI');
  await t.close();
}
