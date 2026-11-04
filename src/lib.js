'use strict';
// Shared helpers + the site layout (head, header, footer). Pages are plain functions that return HTML strings.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));

const cfg = readJson('site.config.json');
const services = readJson('content/services.json');
const hosting = readJson('content/hosting.json');
const faqs = readJson('content/faqs.json');
const work = readJson('content/work.json');
const testimonials = readJson('content/testimonials.json');

const SITE = cfg.siteUrl.replace(/\/+$/, '');
const NAME = cfg.company.legalName;
const SHORT = cfg.company.shortName;

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const has = (v) => typeof v === 'string' && v.trim() !== '';

// ---- icons (24x24, stroke based) ----
const P = {
  monitor: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
  code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
  bag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0"/>',
  server: '<rect x="2" y="3" width="20" height="7" rx="2"/><rect x="2" y="14" width="20" height="7" rx="2"/><path d="M6 6.5h.01M6 17.5h.01"/>',
  layout: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  cap: '<path d="M22 10 12 5 2 10l10 5 10-5zM6 12v5c3 3 9 3 12 0v-5"/>',
  tool: '<path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6z"/><path d="m9 12 2 2 4-4"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><path d="M7 7h.01"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  life: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="m5.6 5.6 3.2 3.2M15.2 15.2l3.2 3.2M18.4 5.6l-3.2 3.2M8.8 15.2l-3.2 3.2"/>',
  award: '<circle cx="12" cy="9" r="6"/><path d="m8.5 14-1.5 8 5-3 5 3-1.5-8"/>',
  book: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10M6 10h10"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>',
  whatsapp: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>'
};
const icon = (n, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${P[n] || ''}</svg>`;

// ---- contact details: only what has been configured is ever shown ----
const digits = (v) => String(v || '').replace(/[^\d+]/g, '');
const waLink = () => has(cfg.contact.whatsappNumber)
  ? `https://wa.me/${digits(cfg.contact.whatsappNumber).replace(/^\+/, '')}?text=${encodeURIComponent(cfg.contact.whatsappMessage || '')}` : '';
function contactItems() {
  const c = cfg.contact, out = [];
  if (has(c.email)) out.push({ icon: 'mail', label: 'Email', html: `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` });
  if (has(c.phone)) out.push({ icon: 'phone', label: 'Phone', html: `<a href="tel:${esc(digits(c.phone))}">${esc(c.phone)}</a>` });
  if (waLink()) out.push({ icon: 'chat', label: 'WhatsApp', html: `<a href="${esc(waLink())}" rel="noopener" target="_blank">Message us on WhatsApp</a>` });
  if (has(c.address) && c.addressVerified === true) out.push({ icon: 'pin', label: 'Address', html: esc(c.address).replace(/\n/g, '<br>') });
  if (has(c.hours)) out.push({ icon: 'clock', label: 'Hours', html: esc(c.hours) });
  return out;
}

// ---- brand ----
const brand = (extra = '') => `<a class="brand" href="/" aria-label="${esc(SHORT)} home"${extra}>
      <span class="mark" aria-hidden="true"><i class="ring"></i><i class="sym"></i></span>
      <span class="wm"><b>SATURN</b><small>TECHNOLOGIES</small></span>
    </a>`;

const NAV = [
  ['/', 'Home'], ['/services', 'Services'], ['/our-work', 'Our Work'], ['/hosting', 'Hosting'], ['/about', 'About'],
  ...(cfg.training && cfg.training.enabled ? [['/training', 'Training']] : []), ['/contact', 'Contact']
];

function header(cur) {
  const links = NAV.map(([href, label]) => {
    const active = cur === href || (href !== '/' && cur.startsWith(href + '/'));
    return `<li><a href="${href}"${active ? ' aria-current="page"' : ''}>${label}</a></li>`;
  }).join('');
  return `<header class="site-header">
  <div class="wrap nav">
    ${brand()}
    <nav aria-label="Main"><ul id="site-nav">${links}</ul></nav>
    <a class="btn sm nav-cta" href="/contact">Free Consultation</a>
    <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="Open menu">${icon('menu')}</button>
  </div>
</header>`;
}

const SOCIALS = [['linkedin', 'LinkedIn', 'in'], ['instagram', 'Instagram', 'ig'], ['facebook', 'Facebook', 'fb'], ['x', 'X', 'x'], ['youtube', 'YouTube', 'yt'], ['github', 'GitHub', 'gh']];
const socialLinks = () => SOCIALS.filter(([k]) => has(cfg.social[k]));

function footer() {
  const ci = contactItems();
  const soc = socialLinks();
  return `<footer class="site-footer">
  <div class="wrap">
    <div class="fgrid">
      <div>
        ${brand()}
        <p>Software development, websites, web applications, e-commerce, hosting and IT services for growing businesses.</p>
        ${soc.length ? `<div class="social">${soc.map(([k, n, t]) => `<a href="${esc(cfg.social[k])}" rel="noopener" target="_blank" aria-label="${n}">${t}</a>`).join('')}</div>` : ''}
      </div>
      <div>
        <h2>Services</h2>
        <ul>${services.map((s) => `<li><a href="/services/${s.slug}">${esc(s.title)}</a></li>`).join('')}</ul>
      </div>
      <div>
        <h2>Company</h2>
        <ul>
          <li><a href="/about">About Us</a></li><li><a href="/our-work">Our Work</a></li><li><a href="/hosting">Hosting Plans</a></li>
          ${cfg.training && cfg.training.enabled ? '<li><a href="/training">Training &amp; Internship</a></li>' : ''}
          <li><a href="/contact">Contact Us</a></li>
        </ul>
      </div>
      <div>
        <h2>Get in touch</h2>
        <ul>
          <li><a href="/contact">Send an enquiry</a></li>
          ${ci.map((i) => `<li>${i.html}</li>`).join('')}
        </ul>
      </div>
    </div>
    <div class="legal-row">
      <span>© ${new Date().getFullYear()} ${esc(NAME)}. All rights reserved.${has(cfg.registration.cin) ? ` CIN: ${esc(cfg.registration.cin)}.` : ''}${has(cfg.registration.gstin) ? ` GSTIN: ${esc(cfg.registration.gstin)}.` : ''}</span>
      <ul>
        <li><a href="/privacy">Privacy Policy</a></li>
        <li><a href="/terms">Terms and Conditions</a></li>
        <li><a href="/refund-policy">Refund and Cancellation Policy</a></li>
      </ul>
    </div>
  </div>
</footer>`;
}

// ---- full document ----
function layout({ path: p, title, description, body, noindex = false, jsonld = [], crumbs = null, fullTitle = false, scripts = [] }) {
  const url = SITE + (p === '/' ? '' : p);
  const t = fullTitle ? title : `${title} | ${SHORT}`;
  const org = {
    '@context': 'https://schema.org', '@type': 'Organization', name: NAME, url: SITE + '/', logo: `${SITE}/assets/img/apple-touch-icon.png`,
    ...(has(cfg.contact.email) || has(cfg.contact.phone) ? { contactPoint: [{ '@type': 'ContactPoint', contactType: 'customer support', ...(has(cfg.contact.email) ? { email: cfg.contact.email } : {}), ...(has(cfg.contact.phone) ? { telephone: cfg.contact.phone } : {}) }] } : {}),
    ...(socialLinks().length ? { sameAs: socialLinks().map(([k]) => cfg.social[k]) } : {})
  };
  const ld = [org, ...jsonld];
  if (crumbs) ld.push({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: crumbs.map(([n, h], i) => ({ '@type': 'ListItem', position: i + 1, name: n, item: SITE + (h === '/' ? '/' : h) })) });
  return `<!doctype html>
<html lang="en-IN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
${noindex ? '<meta name="robots" content="noindex, nofollow">' : '<meta name="robots" content="index, follow, max-image-preview:large">'}
<meta name="theme-color" content="#061f3d">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(NAME)}">
<meta property="og:title" content="${esc(t)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${SITE}/assets/img/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/png" sizes="64x64" href="/assets/img/favicon-64.png">
<link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">
<link rel="preload" href="/assets/fonts/inter-Regular.woff" as="font" type="font/woff" crossorigin>
<link rel="preload" href="/assets/fonts/inter-ExtraBold.woff" as="font" type="font/woff" crossorigin>
<link rel="stylesheet" href="/assets/css/styles.css">
${ld.map((o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`).join('\n')}
</head>
<body>
<a class="skip" href="#main">Skip to main content</a>
${header(p)}
<main id="main">
${body}
</main>
${footer()}
<script src="/assets/js/main.js" defer></script>
${scripts.map((s) => `<script src="${s}" defer></script>`).join('\n')}
</body>
</html>
`;
}

// page header used on inner pages
function pageHero({ crumbs, title, lead }) {
  return `<section class="page-hero">
  <div class="wrap">
    <ol class="crumbs" aria-label="Breadcrumb">${crumbs.map(([n, h], i) => (i === crumbs.length - 1 ? `<li aria-current="page">${esc(n)}</li>` : `<li><a href="${h}">${esc(n)}</a></li>`)).join('')}</ol>
    <h1>${esc(title)}</h1>
    ${lead ? `<p>${esc(lead)}</p>` : ''}
  </div>
</section>`;
}

const ctaBand = (title = 'Ready to start your project?', text = 'Tell us what you need. We will discuss it with you and send a written proposal.', label = 'Get a Free Consultation') => `<section class="cta-band">
  <div class="wrap">
    <div><h2>${esc(title)}</h2><p>${esc(text)}</p></div>
    <a class="btn" href="/contact">${esc(label)} ${icon('arrow')}</a>
  </div>
</section>`;

const money = (n) => `${hosting.currency}${Number(n).toLocaleString('en-IN')}`;

module.exports = { cfg, services, hosting, faqs, work, testimonials, SITE, NAME, SHORT, esc, has, icon, contactItems, waLink, layout, pageHero, ctaBand, money, root, brand };
