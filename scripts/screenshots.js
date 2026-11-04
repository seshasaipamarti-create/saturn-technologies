'use strict';
// Generates REAL screenshots of the three demonstration projects (assets/img/work/*.png) and the social share image
// (assets/img/og-image.png). Run after `npm run build`:  node scripts/screenshots.js
// Requires Playwright (already available in this workspace). PNGs are converted to WebP by scripts/to-webp.py.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { start } = require('../tests/server');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'assets/img/work');
fs.mkdirSync(outDir, { recursive: true });
const b64 = (f) => 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'assets/img', f)).toString('base64');

(async () => {
  const srv = await start({});
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  await page.goto(srv.origin + '/demos/restaurant-booking/'); await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, 'restaurant-booking.png') });

  await page.goto(srv.origin + '/demos/inventory-dashboard/'); await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, 'inventory-dashboard.png') });

  await page.goto(srv.origin + '/demos/online-store/'); await page.waitForTimeout(300);
  const adds = page.locator('.add');
  await adds.nth(0).click(); await adds.nth(2).click(); await adds.nth(2).click();
  await page.click('#open-cart'); await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, 'online-store.png') });

  // social share image (1200x630)
  const og = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await og.setContent(`<!doctype html><meta charset="utf-8"><style>
    *{margin:0;box-sizing:border-box}body{width:1200px;height:630px;background:radial-gradient(900px 520px at 90% 0%,#1a5496 0%,transparent 70%),#061f3d;color:#fff;font-family:Inter,system-ui,"Segoe UI",Arial,sans-serif;padding:72px 80px;display:flex;flex-direction:column;justify-content:space-between}
    .logo{position:relative;width:200px;height:118px}.logo img{position:absolute;inset:0;width:100%;height:100%}
    h1{font-size:64px;line-height:1.08;letter-spacing:-.02em;max-width:900px}h1 span{color:#fc7705}
    p{font-size:26px;color:#c7d4e8;margin-top:18px;max-width:880px}.foot{font-size:22px;letter-spacing:.14em;color:#8fa7c7;text-transform:uppercase}
  </style><div class="logo"><img src="${b64('logo-ring.png')}"><img src="${b64('logo-s-white.png')}"></div>
  <div><h1>Technology that helps your business <span>grow.</span></h1><p>Websites, web applications, e-commerce, hosting and IT services.</p></div>
  <div class="foot">Saturn Technologies India Private Limited</div>`);
  await og.waitForTimeout(300);
  await og.screenshot({ path: path.join(root, 'assets/img/og-image.png') });

  await browser.close(); await srv.close();
  console.log('Screenshots written to assets/img/work/*.png and assets/img/og-image.png');
})().catch((e) => { console.error(e); process.exit(1); });
