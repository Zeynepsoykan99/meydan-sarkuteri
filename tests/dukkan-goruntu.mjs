/* C4 — 375px ekran görüntüsü: dolduruldu:true + gerçekçi örnek veri. */
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';

const B = process.env.ADRES || 'http://localhost:3000';
const KOK = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '');
const VERI = `${KOK}/data/dukkan.json`;
const CIKTI = `${KOK}/.gorsel`;
const OZGUN = readFileSync(VERI);

/* Dosya artık gerçek bilgilerle dolu; sahte veri yazmıyoruz. */

const t = await chromium.launch({ executablePath: process.env.CHROME_YOLU || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  // Bölüm tek karede sığsın; genişlik gerçek telefon ölçüsü.
  const c = await t.newContext({ viewport: { width: 375, height: 1000 } });
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

  await c.close();

  /* 1280px — masaüstünde kutu yerleşimi */
  const c2 = await t.newContext({ viewport: { width: 1280, height: 800 } });
  const s2 = await c2.newPage();
  await s2.goto(B, { waitUntil: 'networkidle', timeout: 60000 });
  await s2.waitForTimeout(1200);
  await s2.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await s2.waitForTimeout(1500);
  let ust2 = null;
  for (let i = 0; i < 8; i++) {
    await s2.evaluate(() => {
      const b = document.getElementById('dukkan').getBoundingClientRect().top + window.scrollY;
      const h = document.querySelector('.baslik').getBoundingClientRect().height;
      window.scrollTo(0, b - h - 8);
    });
    await s2.waitForTimeout(600);
    ust2 = await s2.evaluate(() => Math.round(document.getElementById('dukkan').getBoundingClientRect().top));
    if (ust2 >= 0 && ust2 <= 140) break;
  }
  console.log('1280px bolum ust kenari:', ust2);
  await s2.screenshot({ path: `${CIKTI}/masaustu-dukkan-bolumu.png` });
  const yer = await s2.evaluate(() => [...document.querySelectorAll('.dukkan-kutu')].map((x) => {
    const b = x.getBoundingClientRect();
    return `${x.querySelector('h3').textContent}: ${Math.round(b.width)}px @ x=${Math.round(b.left)}`;
  }));
  console.log('1280px kutular:', yer.join(' | '));
  await c2.close();
  console.log('görüntüler:', `${CIKTI}/{telefon,masaustu}-dukkan-*.png`);
} finally {
  writeFileSync(VERI, OZGUN);
  console.log(readFileSync(VERI).equals(OZGUN) ? 'dukkan.json dokunulmadi' : 'DOSYA DEGISTI');
  await t.close();
}
