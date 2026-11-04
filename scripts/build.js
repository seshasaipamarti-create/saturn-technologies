'use strict';
// Build: renders every page to /public, copies assets and demos, writes sitemap.xml + robots.txt,
// and writes ADMIN-CHECKLIST.md listing the information the owner still has to supply.
// Usage: node scripts/build.js        (no dependencies)
const fs = require('fs');
const path = require('path');
const L = require('../src/lib');
const P = require('../src/pages');
const G = require('../src/legal');

const root = L.root;
const out = path.join(root, 'public');
const { cfg, services, hosting, testimonials, work, SITE, has } = L;
const training = JSON.parse(fs.readFileSync(path.join(root, 'content/training.json'), 'utf8'));

// Ensure course materials and PDFs are generated for student dashboard
try {
  require('./generate-materials').generateAllMaterials();
} catch (_) {}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const pages = [
  ['/', P.home(), 1.0, 'weekly'],
  ['/services', P.servicesIndex(), 0.9, 'monthly'],
  ...services.map((s) => [`/services/${s.slug}`, P.serviceDetail(s), 0.8, 'monthly']),
  ['/our-work', P.ourWork(), 0.8, 'monthly'],
  ['/hosting', P.hostingPage(), 0.8, 'monthly'],
  ['/about', P.about(), 0.7, 'monthly'],
  ...(cfg.training && cfg.training.enabled ? [
    ['/training', P.trainingPage(), 0.6, 'monthly'],
    ['/training/register', P.trainingRegister(), 0.5, 'monthly'],
    ['/training/course-registration', P.courseRegistrationPage(), 0.5, 'monthly'],
    ['/training/dashboard', P.trainingDashboard(), 0.2, 'monthly']
  ] : []),
  ['/contact', P.contact(), 0.9, 'monthly'],
  ['/privacy', G.privacy(), 0.3, 'yearly'],
  ['/terms', G.terms(), 0.3, 'yearly'],
  ['/refund-policy', G.refund(), 0.3, 'yearly'],
  ['/admin', P.adminRedirect(), 0.0, 'never'],
  ['/admin/login', P.adminLogin(), 0.0, 'never'],
  ['/admin/dashboard', P.adminDashboard(), 0.0, 'never']
];

const fileFor = (url) => (url === '/' ? 'index.html' : url.slice(1) + '.html');
for (const [url, html] of pages) {
  const f = path.join(out, fileFor(url));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, html);
}
fs.writeFileSync(path.join(out, 'admin', 'index.html'), P.adminRedirect());
fs.writeFileSync(path.join(out, '404.html'), P.notFound());

const copyDir = (from, to) => {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    e.isDirectory() ? copyDir(a, b) : fs.copyFileSync(a, b);
  }
};
copyDir(path.join(root, 'assets'), path.join(out, 'assets'));
copyDir(path.join(root, 'demos'), path.join(out, 'demos'));

const today = new Date().toISOString().slice(0, 10);
const publicPages = pages.filter(([u]) => !u.startsWith('/admin'));
fs.writeFileSync(path.join(out, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  publicPages.map(([u, , pr, cf]) => `  <url><loc>${SITE}${u === '/' ? '/' : u}</loc><lastmod>${today}</lastmod><changefreq>${cf}</changefreq><priority>${pr.toFixed(1)}</priority></url>`).join('\n') +
  `\n</urlset>\n`);
fs.writeFileSync(path.join(out, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin/\n\nSitemap: ${SITE}/sitemap.xml\n`);

// ---------- admin checklist ----------
const todo = [];   // owner must supply
const verify = []; // owner must confirm
if (!has(cfg.contact.email)) todo.push('Business email address (site.config.json > contact.email). Hidden on the site until set.');
if (!has(cfg.contact.phone)) todo.push('Business phone number (contact.phone). Hidden until set.');
if (!has(cfg.contact.whatsappNumber)) todo.push('WhatsApp number in international format, e.g. +91XXXXXXXXXX (contact.whatsappNumber). The WhatsApp button is hidden until set.');
if (!has(cfg.contact.address) || cfg.contact.addressVerified !== true) todo.push('Registered office address (contact.address) and set contact.addressVerified to true. Hidden until both are done.');
if (!has(cfg.contact.hours)) todo.push('Business hours (contact.hours), optional.');
if (!has(cfg.registration.cin)) todo.push('CIN (registration.cin), optional but recommended for a private limited company.');
if (!has(cfg.registration.gstin)) todo.push('GSTIN (registration.gstin), if registered for GST.');
if (!has(cfg.legal.governingLawCity)) todo.push('City whose courts have jurisdiction (legal.governingLawCity). The legal pages currently say "competent courts in India".');
if (!Object.values(cfg.social).some(has)) todo.push('Social media links (social.*), optional.');
todo.push('Vercel environment variables for the enquiry form: RESEND_API_KEY, CONTACT_TO_EMAIL, CONTACT_FROM_EMAIL (see README.md). Without them the form shows a clear "unavailable" message and nothing is sent.');
const nullSpecs = [];
for (const p of hosting.plans) for (const [k, v] of Object.entries(p.specs)) if (v == null || String(v).trim() === '') nullSpecs.push(`${p.name}: ${k}`);
if (nullSpecs.length) verify.push(`Hosting specifications not yet confirmed (shown publicly as "Confirmed on enquiry"): ${nullSpecs.length} values in content/hosting.json (${[...new Set(hosting.plans.flatMap((p) => Object.keys(p.specs)))].join(', ')}). Backup frequency in particular must be confirmed (an earlier version of the site said both daily and weekly).`);
for (const k of ['duration', 'mode', 'fee', 'nextBatch']) if (!has(training[k])) verify.push(`Training programme ${k} (content/training.json) is blank and therefore hidden.`);
if (!testimonials.length) verify.push('No testimonials yet. The section is hidden until you add genuine reviews to content/testimonials.json (with the customer\'s permission).');
if (!work.projects.some((p) => !p.isDemo)) verify.push('All portfolio items are labelled demonstration projects. Add real client work (with permission) to content/work.json when available.');
if (cfg.siteUrl.includes('vercel.app')) verify.push('siteUrl is still the vercel.app address. When your own domain is connected, update siteUrl in site.config.json so canonical URLs, the sitemap and social previews use it.');
if (cfg.legal.showDraftNotice) verify.push('Legal pages are drafts. Have an Indian lawyer review the Privacy Policy, Terms and Refund Policy, then set legal.showDraftNotice to false.');
verify.push('Email provider: the privacy policy names ' + cfg.legal.emailProvider + ' as the email delivery provider. If you use another provider, change legal.emailProvider and the API code.');

fs.writeFileSync(path.join(root, 'ADMIN-CHECKLIST.md'),
  `# Admin checklist (generated by the build)\n\nRe-generated every time you run \`npm run build\`. Nothing below is shown publicly as if it were real.\n\n## Information only you can provide\n\n${todo.map((t) => `- [ ] ${t}`).join('\n')}\n\n## Items to verify or confirm\n\n${verify.map((t) => `- [ ] ${t}`).join('\n')}\n`);

console.log(`Built ${pages.length + 1} pages -> public/ (${pages.map((p) => p[0]).join(', ')}, /404)`);
console.log(`ADMIN-CHECKLIST.md: ${todo.length} items to provide, ${verify.length} to verify`);
