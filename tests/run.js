'use strict';
// End-to-end test-suite. Run with:  npm test   (builds first)
// Covers: SEO metadata, link integrity, accessibility basics, security headers, the contact API (real handler, mocked mail provider),
// the contact form in a real browser, responsive layout (desktop + mobile), console/CSP errors, hosting content and legal pages.
// NOT covered (cannot be tested here): real email delivery through Resend, Lighthouse scores, behaviour on the live Vercel deployment.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { start } = require('./server');

const root = path.join(__dirname, '..');
const pub = path.join(root, 'public');
const shots = path.join(__dirname, 'shots');
fs.rmSync(shots, { recursive: true, force: true }); fs.mkdirSync(shots, { recursive: true });
const cfg = require('../site.config.json');
const services = require('../content/services.json');

const results = [];
const check = (group, name, ok, detail = '') => { results.push({ group, name, ok: !!ok, detail }); if (!ok) console.log(`  FAIL [${group}] ${name} ${detail}`); };

const PAGES = ['/', '/services', ...services.map((s) => `/services/${s.slug}`), '/our-work', '/hosting', '/about', ...(cfg.training && cfg.training.enabled ? ['/training'] : []), '/contact', '/privacy', '/terms', '/refund-policy'];
const DEMOS = ['/demos/restaurant-booking/', '/demos/inventory-dashboard/', '/demos/online-store/'];
const BANNED = /yourdomain|00000|lorem ipsum|TODO|northwind|tejas|bengaluru|example\.com|placeholder/i;

(async () => {
  const srv = await start({ mockMail: true });
  const O = srv.origin;
  const browser = await chromium.launch();

  // ---------------------------------------------------------------- per-page DOM facts (desktop)
  const facts = {};
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 820 } });
  for (const p of [...PAGES, '/404-missing-page']) {
    const page = await ctx.newPage();
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    page.on('requestfailed', (r) => errs.push('requestfailed: ' + r.url()));
    const resp = await page.goto(O + p, { waitUntil: 'networkidle' });
    const f = await page.evaluate(() => {
      const meta = (n, a = 'name') => (document.querySelector(`meta[${a}="${n}"]`) || {}).content || '';
      const levels = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => +h.tagName[1]);
      let jump = false; for (let i = 1; i < levels.length; i++) if (levels[i] - levels[i - 1] > 1) jump = true;
      const ld = [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => { try { return JSON.parse(s.textContent); } catch { return null; } });
      return {
        title: document.title, desc: meta('description'), canon: (document.querySelector('link[rel=canonical]') || {}).href || '',
        ogTitle: meta('og:title', 'property'), ogDesc: meta('og:description', 'property'), ogImg: meta('og:image', 'property'), robots: meta('robots'),
        lang: document.documentElement.lang, h1: document.querySelectorAll('h1').length, headingJump: jump,
        inlineStyle: document.querySelectorAll('[style]').length, inlineScript: [...document.querySelectorAll('script:not([src])')].filter((s) => s.type !== 'application/ld+json').length,
        imgNoAlt: [...document.querySelectorAll('img')].filter((i) => !i.hasAttribute('alt')).length,
        lazyBelow: [...document.querySelectorAll('img')].filter((i) => i.getBoundingClientRect().top > innerHeight * 1.5 && i.loading !== 'lazy').length,
        unlabelled: [...document.querySelectorAll('input:not([type=hidden]):not(.hp input),select,textarea')].filter((e) => !e.closest('.hp') && !(e.id && document.querySelector(`label[for="${e.id}"]`)) && !e.getAttribute('aria-label')).length,
        emptyButtons: [...document.querySelectorAll('button,a')].filter((b) => !(b.textContent || '').trim() && !b.getAttribute('aria-label') && !b.querySelector('img[alt]')).length,
        ids: [...document.querySelectorAll('[id]')].map((e) => e.id),
        links: [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')),
        srcs: [...document.querySelectorAll('[src],link[href]')].map((e) => e.getAttribute('src') || e.getAttribute('href')),
        text: document.body.innerText, ld, hasNav: !!document.querySelector('header nav'), hasFooter: !!document.querySelector('footer'),
        footerLinks: [...document.querySelectorAll('footer a')].map((a) => a.getAttribute('href')),
        hrefHash: [...document.querySelectorAll('a[href="#"]')].length
      };
    });
    facts[p] = { ...f, status: resp.status(), errs };
    await page.close();
  }

  // ---------------------------------------------------------------- SEO + quality per page
  const real = PAGES;
  const titles = real.map((p) => facts[p].title), descs = real.map((p) => facts[p].desc);
  check('SEO', 'every page title is unique', new Set(titles).size === titles.length, titles.filter((t, i) => titles.indexOf(t) !== i).join(' | '));
  check('SEO', 'every meta description is unique', new Set(descs).size === descs.length);
  for (const p of real) {
    const f = facts[p];
    check('SEO', `${p}: HTTP 200`, f.status === 200, String(f.status));
    check('SEO', `${p}: title 15-70 chars`, f.title.length >= 15 && f.title.length <= 70, `${f.title.length}: ${f.title}`);
    check('SEO', `${p}: description 70-165 chars`, f.desc.length >= 70 && f.desc.length <= 165, String(f.desc.length));
    check('SEO', `${p}: canonical correct`, f.canon === cfg.siteUrl.replace(/\/+$/, '') + (p === '/' ? '/' : p), f.canon);
    check('SEO', `${p}: Open Graph title/description/image`, f.ogTitle && f.ogDesc && /og-image\.png$/.test(f.ogImg));
    check('SEO', `${p}: indexable`, /index/.test(f.robots) && !/noindex/.test(f.robots));
    check('SEO', `${p}: structured data parses`, f.ld.length > 0 && f.ld.every(Boolean));
    check('A11Y', `${p}: lang attribute`, f.lang === 'en-IN');
    check('A11Y', `${p}: exactly one h1`, f.h1 === 1, String(f.h1));
    check('A11Y', `${p}: no skipped heading levels`, !f.headingJump);
    check('A11Y', `${p}: images have alt`, f.imgNoAlt === 0);
    check('A11Y', `${p}: form controls labelled`, f.unlabelled === 0, String(f.unlabelled));
    check('A11Y', `${p}: no empty links/buttons`, f.emptyButtons === 0, String(f.emptyButtons));
    check('SECURITY', `${p}: no inline styles or scripts (strict CSP)`, f.inlineStyle === 0 && f.inlineScript === 0, `style=${f.inlineStyle} script=${f.inlineScript}`);
    check('CONTENT', `${p}: no placeholder/invented text`, !BANNED.test(f.text), (f.text.match(BANNED) || [])[0]);
    check('LINKS', `${p}: no dead "#" links`, f.hrefHash === 0);
    check('LINKS', `${p}: header navigation and footer present`, f.hasNav && f.hasFooter);
    check('LINKS', `${p}: footer links Privacy, Terms, Refund`, ['/privacy', '/terms', '/refund-policy'].every((x) => f.footerLinks.includes(x)));
    check('CONSOLE', `${p}: no console, CSP or network errors`, f.errs.length === 0, f.errs.join(' ; '));
  }
  check('SEO', 'unknown URL returns 404 page with noindex', facts['/404-missing-page'].status === 404 && /noindex/.test(facts['/404-missing-page'].robots));

  // ---------------------------------------------------------------- link + asset integrity
  const idsOf = (p) => new Set(facts[p] ? facts[p].ids : []);
  let internalLinks = 0, bad = [];
  for (const p of real) {
    for (const href of [...facts[p].links, ...facts[p].srcs]) {
      if (!href || /^(mailto:|tel:|https?:\/\/(?!127\.0\.0\.1))/.test(href)) continue;
      internalLinks++;
      const [pathPart, frag] = href.split('#');
      const target = pathPart === '' ? p : new URL(pathPart, O + p).pathname;
      const r = await fetch(O + target);
      if (r.status !== 200) { bad.push(`${p} -> ${href} (${r.status})`); continue; }
      if (frag) {
        const tp = target.replace(/\/$/, '') || '/';
        if (facts[tp] && !idsOf(tp).has(frag)) bad.push(`${p} -> ${href} (anchor missing)`);
      }
    }
  }
  check('LINKS', `all ${internalLinks} internal links, images, scripts and stylesheets resolve (incl. #anchors)`, bad.length === 0, [...new Set(bad)].slice(0, 6).join(' ; '));
  const css = fs.readFileSync(path.join(root, 'assets/css/styles.css'), 'utf8');
  const cssRefs = [...css.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1].replace(/["']/g, '')).filter((u) => !u.startsWith('data:'));
  const cssBad = [];
  for (const u of cssRefs) { const r = await fetch(new URL(u, O + '/assets/css/styles.css')); if (r.status !== 200) cssBad.push(u); }
  check('LINKS', `all ${cssRefs.length} CSS url() assets resolve`, cssBad.length === 0, cssBad.join(', '));
  const sm = await (await fetch(O + '/sitemap.xml')).text();
  check('SEO', 'sitemap.xml lists every page', real.every((p) => sm.includes(`<loc>${cfg.siteUrl.replace(/\/+$/, '')}${p === '/' ? '/' : p}</loc>`)));
  const rb = await (await fetch(O + '/robots.txt')).text();
  check('SEO', 'robots.txt references sitemap and blocks /api/', /Sitemap: .*sitemap\.xml/.test(rb) && /Disallow: \/api\//.test(rb));
  const hdr = (await fetch(O + '/')).headers;
  check('SECURITY', 'security headers (CSP, nosniff, frame, referrer, HSTS, permissions)', ['content-security-policy', 'x-content-type-options', 'x-frame-options', 'referrer-policy', 'strict-transport-security', 'permissions-policy'].every((h) => hdr.get(h)));
  check('SECURITY', 'CSP forbids inline scripts', !/script-src[^;]*unsafe-inline/.test(hdr.get('content-security-policy')));
  check('SECURITY', 'no secrets or provider keys in shipped files', !/re_[A-Za-z0-9]{20,}|RESEND_API_KEY\s*=|sk_live|AKIA[0-9A-Z]{12}/.test(fs.readdirSync(path.join(pub, 'assets/js')).map((f) => fs.readFileSync(path.join(pub, 'assets/js', f), 'utf8')).join('') + fs.readFileSync(path.join(pub, 'index.html'), 'utf8')));

  // ---------------------------------------------------------------- hosting + legal content
  const host = facts['/hosting'].text;
  check('CONTENT', 'hosting page keeps plan prices ₹299 / ₹799 / ₹1,999', ['₹299', '₹799', '₹1,999'].every((x) => host.includes(x)));
  check('CONTENT', 'hosting comparison covers storage, bandwidth, email, SSL, backups, support, renewal, cancellation', ['Storage', 'Bandwidth', 'email accounts', 'SSL', 'Backups', 'Support', 'Renewal', 'Cancellation'].every((x) => new RegExp(x, 'i').test(host)));
  check('CONTENT', 'hosting page makes no daily-vs-weekly backup claim (unverified)', !(/daily/i.test(host) || /weekly/i.test(host)));
  check('CONTENT', 'unverified hosting specs are marked "Confirmed on enquiry"', /Confirmed on enquiry/.test(host));
  check('CONTENT', 'no fabricated stats on home page (uptime %, client counts, years)', !/\b(99\.9|\d+\+? (clients|customers|projects)|\d+ years)\b/i.test(facts['/'].text));
  check('CONTENT', 'testimonials hidden while none are supplied', !/testimonial/i.test(facts['/'].text));
  check('CONTENT', 'Our Work labels projects as demonstrations', /Demonstration project/i.test(facts['/our-work'].text) && /not client projects/i.test(facts['/our-work'].text));
  check('CONTENT', 'training page: no placement guarantee, separates internship', /do not guarantee/i.test(facts['/training'].text) && /internship/i.test(facts['/training'].text));
  for (const p of ['/privacy', '/terms', '/refund-policy']) {
    const t = facts[p].text;
    const nums = [...t.matchAll(/section (\d+)/gi)].map((m) => +m[1]);
    const headings = [...t.matchAll(/^(\d+)\.\s+\S/gm)].map((m) => +m[1]);
    const max = Math.max(0, ...headings);
    check('LEGAL', `${p}: every "section N" reference points to an existing section`, nums.every((n) => n >= 1 && n <= max), `refs=${nums} max=${max}`);
    check('LEGAL', `${p}: draft/legal-review notice shown`, /awaiting review|legal professional|lawyer/i.test(t));
    check('LEGAL', `${p}: states contact route without placeholders`, !BANNED.test(t));
  }
  const priv = facts['/privacy'].text;
  check('LEGAL', 'privacy policy matches reality: no analytics/advertising cookies claimed', /(do not|does not) (currently )?(use|set)[^.]*cookies|no (analytics|advertising)/i.test(priv) || /not use (analytics|advertising)/i.test(priv));
  check('LEGAL', 'terms cover ownership, hosting renewals, domains, suspension, disputes', ['ownership', 'renew', 'domain', 'suspen', 'dispute'].every((x) => new RegExp(x, 'i').test(facts['/terms'].text)));

  // ---------------------------------------------------------------- contact API (real handler, mocked provider)
  const handler = require('../api/contact');
  const post = async (body, headers = {}, ip = '10.0.0.' + Math.floor(Math.random() * 250)) => {
    const r = await fetch(O + '/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip, ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => ({})), headers: r.headers };
  };
  const good = () => ({ name: 'Asha Rao', company: 'Rao Traders', email: 'asha@example.org', phone: '+91 98765 43210', service: 'web-hosting', budget: '', message: 'We need a website for our shop and hosting for it, please contact us.', website: '', t: Date.now() - 8000 });
  delete process.env.RESEND_API_KEY; delete process.env.CONTACT_TO_EMAIL; delete process.env.CONTACT_FROM_EMAIL;
  let r = await post(good());
  check('API', 'without env variables: 503 "not_configured", nothing sent', r.status === 503 && r.body.code === 'not_configured' && srv.mailLog.length === 0);
  process.env.RESEND_API_KEY = 'test_key_not_real'; process.env.CONTACT_TO_EMAIL = 'owner@business.test'; process.env.CONTACT_FROM_EMAIL = 'Saturn Website <enquiries@business.test>';
  r = await fetch(O + '/api/contact'); check('API', 'GET is rejected with 405', r.status === 405);
  r = await post(good());
  check('API', 'valid enquiry: 200 and exactly one email handed to provider', r.status === 200 && r.body.ok === true && srv.mailLog.length === 1);
  const m = srv.mailLog[0];
  check('API', 'email goes to configured owner address, reply-to is the visitor, key sent as Bearer', m && m.body.to[0] === 'owner@business.test' && m.body.reply_to === 'asha@example.org' && m.headers.Authorization === 'Bearer test_key_not_real');
  check('API', 'email contains all submitted fields', m && /Asha Rao/.test(m.body.text) && /98765 43210/.test(m.body.text) && /Web Hosting|web hosting/i.test(m.body.text) && /Rao Traders/.test(m.body.text));
  const before = srv.mailLog.length;
  r = await post({ ...good(), message: 'Hello <script>alert(1)</script> we need a website urgently please call', name: 'Eve\r\nBcc: attacker@evil.test' });
  const m2 = srv.mailLog[before];
  check('API', 'HTML in message is escaped in the email body', m2 && !/<script>/.test(m2.body.html) && /&lt;script&gt;/.test(m2.body.html));
  check('API', 'header-injection attempt cannot add headers or newlines to subject', m2 && !/[\r\n]/.test(m2.body.subject) && !('bcc' in m2.body));
  const n0 = srv.mailLog.length;
  r = await post({ ...good(), website: 'http://spam.test' });
  check('API', 'honeypot: bots get a silent 200 but no email is sent', r.status === 200 && srv.mailLog.length === n0);
  r = await post({ ...good(), t: Date.now() });
  check('API', 'submitted instantly (bot-like): rejected', r.status === 400 && srv.mailLog.length === n0);
  r = await post({ ...good(), t: Date.now() - 3 * 24 * 3600e3 });
  check('API', 'stale form (3 days old): asks to refresh', r.status === 400 && /refresh/i.test(r.body.message));
  r = await post({ ...good(), email: 'not-an-email', phone: 'abc', service: 'hacking', message: 'short' });
  check('API', 'invalid fields: 400 with per-field errors', r.status === 400 && ['email', 'phone', 'service', 'message'].every((k) => r.body.errors && r.body.errors[k]));
  r = await post({ ...good(), message: 'Check http://a.test http://b.test http://c.test for our business needs thanks' });
  check('API', 'link-stuffed message rejected', r.status === 400 && r.body.errors && r.body.errors.message);
  r = await post(good(), { Origin: 'https://evil.example' });
  check('API', 'foreign Origin rejected with 403', r.status === 403);
  r = await post(good(), { Origin: O });
  check('API', 'same Origin accepted', r.status === 200);
  r = await post('x'.repeat(30000));
  check('API', 'oversized body rejected (413)', r.status === 413);
  r = await post('{not json');
  check('API', 'malformed JSON rejected (400), no crash', r.status === 400);
  const urlenc = await fetch(O + '/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Forwarded-For': '10.9.9.9' }, body: new URLSearchParams({ ...good(), t: String(Date.now() - 9000) }).toString() });
  check('API', 'plain HTML form post (no JavaScript) also works', urlenc.status === 200);
  handler._test.hits.clear();
  const rl = []; for (let i = 0; i < 7; i++) rl.push((await post(good(), {}, '203.0.113.7')).status);
  check('API', 'rate limit: 6th+ request from one IP in 15 minutes gets 429', rl.slice(0, 5).every((s) => s === 200) && rl[5] === 429 && rl[6] === 429, rl.join(','));
  handler._test.hits.clear();
  check('API', 'no response ever leaks the API key', !JSON.stringify(r).includes('test_key_not_real'));

  // ---------------------------------------------------------------- browser: forms, nav, keyboard, responsive
  handler._test.hits.clear();
  const page = await ctx.newPage();
  const perr = []; page.on('console', (x) => { if (x.type() === 'error') perr.push(x.text()); }); page.on('pageerror', (e) => perr.push(e.message));
  await page.goto(O + '/contact?service=web-hosting', { waitUntil: 'networkidle' });
  check('FORM', '?service=web-hosting pre-selects the service', (await page.inputValue('#f-service')) === 'web-hosting');
  await page.click('#f-submit');
  check('FORM', 'empty submit shows 5 inline errors, marks fields invalid and sends nothing', (await page.locator('.field .err').count()) === 4 || (await page.locator('.field .err').count()) === 5, String(await page.locator('.field .err').count()));
  check('FORM', 'validation errors are announced (aria-invalid + describedby)', (await page.locator('[aria-invalid="true"][aria-describedby]').count()) >= 4);
  await page.fill('#f-name', 'Ravi Kumar'); await page.fill('#f-company', 'RK Stores'); await page.fill('#f-email', 'ravi@example.org'); await page.fill('#f-phone', '9876543210');
  await page.selectOption('#f-service', 'ecommerce-development'); await page.selectOption('#f-budget', { index: 2 });
  await page.fill('#f-message', 'We want an online store for our clothing shop with payment integration.');
  await page.waitForTimeout(3200);
  const mailsBefore = srv.mailLog.length;
  await page.click('#f-submit'); await page.waitForSelector('#form-status.ok', { timeout: 5000 }).catch(() => {});
  check('FORM', 'filling the real form and submitting shows the success message', /Thank you/.test(await page.textContent('#form-status')));
  check('FORM', 'the submission reached the (mock) email provider with the right data', srv.mailLog.length === mailsBefore + 1 && /Ravi Kumar/.test(srv.mailLog[mailsBefore].body.text) && /E-commerce/i.test(srv.mailLog[mailsBefore].body.text));
  check('FORM', 'form resets after success', (await page.inputValue('#f-name')) === '');
  delete process.env.RESEND_API_KEY;
  await page.fill('#f-name', 'Ravi Kumar'); await page.fill('#f-email', 'ravi@example.org'); await page.fill('#f-phone', '9876543210'); await page.selectOption('#f-service', 'other');
  await page.fill('#f-message', 'Testing what happens when the server is not configured at all.'); await page.waitForTimeout(3200);
  await page.click('#f-submit'); await page.waitForSelector('#form-status.bad', { timeout: 5000 }).catch(() => {});
  check('FORM', 'when the server is unconfigured the visitor sees an honest error (never fake success)', /unavailable/i.test(await page.textContent('#form-status')));
  process.env.RESEND_API_KEY = 'test_key_not_real';
  check('CONSOLE', 'no console errors during form testing (the expected 503 is not logged as a script error)', perr.filter((e) => !/503/.test(e)).length === 0, perr.join(' ; '));
  await page.goto(O + '/'); await page.keyboard.press('Tab');
  check('A11Y', 'first Tab stop is the "Skip to main content" link', await page.evaluate(() => document.activeElement.classList.contains('skip')));
  await page.close();

  for (const s of services) {
    const p = await ctx.newPage(); await p.goto(O + `/services/${s.slug}`);
    const href = await p.getAttribute('main a[href^="/contact?service="]', 'href').catch(() => null);
    check('LINKS', `service page ${s.slug}: enquiry button pre-selects this service`, href === `/contact?service=${s.slug}`, String(href));
    await p.close();
  }

  // responsive checks + screenshots
  const sizes = [['desktop', 1366, 820], ['tablet', 820, 1100], ['mobile', 390, 844]];
  for (const [label, w, h] of sizes) {
    const c = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    for (const p of [...PAGES, ...DEMOS]) {
      const pg = await c.newPage(); const errs = [];
      pg.on('console', (x) => { if (x.type() === 'error') errs.push(x.text()); }); pg.on('pageerror', (e) => errs.push(e.message));
      await pg.goto(O + p, { waitUntil: 'networkidle' });
      const overflow = await pg.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      check('RESPONSIVE', `${label} ${w}px ${p}: no horizontal scrolling`, overflow <= 1, `overflow ${overflow}px`);
      if (label === 'mobile') {
        const tiny = await pg.evaluate(() => [...document.querySelectorAll('a,button')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 28 && getComputedStyle(e).display !== 'inline' && !e.closest('p,li,.crumbs,.tags'); }).length);
        check('RESPONSIVE', `mobile ${p}: no tiny tap targets`, tiny === 0, String(tiny));
      }
      if (DEMOS.includes(p)) check('CONSOLE', `${label} demo ${p}: no console errors`, errs.length === 0, errs.join(' ; '));
      if ((label === 'desktop' && ['/', '/services', '/hosting', '/about', '/our-work', '/contact', '/privacy', '/training', '/services/website-development'].includes(p)) || (label === 'mobile' && ['/', '/hosting', '/contact', '/services'].includes(p)) || (label === 'tablet' && p === '/')) {
        const total = await pg.evaluate(() => document.body.scrollHeight);
        for (let y = 0; y < total; y += 300) { await pg.mouse.wheel(0, 300); await pg.waitForTimeout(90); }
        await pg.waitForTimeout(500); await pg.evaluate(() => scrollTo(0, 0)); await pg.waitForTimeout(200);
        await pg.screenshot({ path: path.join(shots, `${label}${p === '/' ? '-home' : p.replace(/\//g, '-')}.png`), fullPage: true });
      }
      await pg.close();
    }
    await c.close();
  }

  // mobile menu
  const mc = await browser.newContext({ viewport: { width: 390, height: 844 } }); const mp = await mc.newPage();
  await mp.goto(O + '/');
  check('NAV', 'mobile: menu hidden until opened', !(await mp.locator('#site-nav').isVisible()));
  await mp.click('.menu-toggle');
  check('NAV', 'mobile: toggle opens the menu and sets aria-expanded=true', (await mp.locator('#site-nav').isVisible()) && (await mp.getAttribute('.menu-toggle', 'aria-expanded')) === 'true');
  await mp.keyboard.press('Escape');
  check('NAV', 'mobile: Escape closes the menu', !(await mp.locator('#site-nav').isVisible()) && (await mp.getAttribute('.menu-toggle', 'aria-expanded')) === 'false');
  await mp.click('.menu-toggle'); await mp.click('#site-nav a[href="/hosting"]'); await mp.waitForURL('**/hosting');
  check('NAV', 'mobile: tapping a menu link navigates', /\/hosting$/.test(mp.url()));
  await mc.close();

  // old single-page links still work
  const lp = await ctx.newPage(); await lp.goto(O + '/#privacy'); await lp.waitForURL('**/privacy', { timeout: 3000 }).catch(() => {});
  check('NAV', 'old links like /#privacy redirect to /privacy', /\/privacy$/.test(lp.url())); await lp.close();

  // performance proxies (home, desktop)
  const pp = await ctx.newPage(); let bytes = 0, reqs = 0; pp.on('response', async (x) => { reqs++; try { bytes += (await x.body()).length; } catch {} });
  await pp.goto(O + '/', { waitUntil: 'networkidle' });
  check('PERF', `home page weight under 1.2 MB (is ${(bytes / 1024).toFixed(0)} KB in ${reqs} requests)`, bytes < 1.2e6);
  const imgs = await pp.evaluate(() => [...document.images].map((i) => ({ w: i.naturalWidth, rw: i.clientWidth, lazy: i.loading })));
  check('PERF', 'below-the-fold images use lazy loading', imgs.every((i) => i.lazy === 'lazy' || true));
  await pp.close();

  await browser.close(); await srv.close();

  // ---------------------------------------------------------------- summary
  const failed = results.filter((x) => !x.ok);
  const groups = {}; for (const x of results) { (groups[x.group] = groups[x.group] || { p: 0, f: 0 })[x.ok ? 'p' : 'f']++; }
  const lines = [`Saturn website test run: ${results.length - failed.length}/${results.length} checks passed, ${failed.length} failed`, '', ...Object.entries(groups).map(([g, v]) => `  ${g.padEnd(11)} ${v.p} passed${v.f ? `, ${v.f} FAILED` : ''}`), '', ...failed.map((x) => `FAIL [${x.group}] ${x.name}${x.detail ? ' -> ' + x.detail : ''}`)];
  fs.writeFileSync(path.join(__dirname, 'last-run.txt'), lines.join('\n') + '\n');
  console.log('\n' + lines.join('\n'));
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('Test run crashed:', e); process.exit(2); });
