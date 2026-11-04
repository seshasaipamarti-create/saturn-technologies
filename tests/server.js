'use strict';
// Local server that behaves like Vercel for this project: clean URLs, /404 page, vercel.json headers,
// and the real /api/contact handler. Used by `npm run dev` and by the test-suite.
//   node tests/server.js --port 3000
// With { mockMail: true } outgoing calls to api.resend.com are captured instead of sent (tests only).
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pub = path.join(root, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

function start({ port = 0, mockMail = false } = {}) {
  const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  const globalHeaders = (vercel.headers.find((h) => h.source === '/(.*)') || { headers: [] }).headers;
  const mailLog = [];
  if (mockMail) {
    const realFetch = global.fetch;
    global.fetch = async (url, opts) => {
      if (String(url).includes('api.resend.com')) { mailLog.push({ url: String(url), headers: opts.headers, body: JSON.parse(opts.body) }); return { ok: true, status: 200, json: async () => ({ id: 'test' }) }; }
      return realFetch(url, opts);
    };
  }
  const handler = require('../api/contact');
  const studentHandler = require('../api/student');
  const cashfreeHandler = require('../api/cashfree');

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let p = decodeURIComponent(url.pathname);
    for (const h of globalHeaders) res.setHeader(h.key, h.value);

    if (p === '/api/contact') return handler(req, res);
    if (p === '/api/student' || p.startsWith('/api/student/')) {
      delete require.cache[require.resolve('../api/student')];
      delete require.cache[require.resolve('../src/db')];
      return require('../api/student')(req, res);
    }
    if (p === '/api/cashfree' || p.startsWith('/api/cashfree/')) {
      delete require.cache[require.resolve('../api/cashfree')];
      delete require.cache[require.resolve('../src/db')];
      return require('../api/cashfree')(req, res);
    }
    if (p === '/api/admin' || p.startsWith('/api/admin/')) {
      delete require.cache[require.resolve('../api/admin')];
      delete require.cache[require.resolve('../src/db')];
      return require('../api/admin')(req, res);
    }

    const cleanP = p.replace(/\/+$/, '') || '/';
    const candidates = [p, cleanP + '.html', path.join(p, 'index.html'), path.join(cleanP, 'index.html')];
    for (const c of candidates) {
      const f = path.normalize(path.join(pub, c));
      if (!f.startsWith(pub)) break;
      if (fs.existsSync(f) && fs.statSync(f).isFile()) {
        if (p.endsWith('.html') && p !== '/404.html') { res.statusCode = 308; res.setHeader('Location', p.slice(0, -5) || '/'); return res.end(); } // cleanUrls
        res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream');
        return fs.createReadStream(f).pipe(res);
      }
    }
    res.statusCode = 404;
    res.setHeader('Content-Type', MIME['.html']);
    res.end(fs.existsSync(path.join(pub, '404.html')) ? fs.readFileSync(path.join(pub, '404.html')) : 'Not found');
  });

  return new Promise((resolve) => server.listen(port, () => {
    const actual = server.address().port;
    resolve({ server, port: actual, origin: `http://localhost:${actual}`, mailLog, close: () => new Promise((r) => server.close(r)) });
  }));
}

module.exports = { start };

if (require.main === module) {
  const i = process.argv.indexOf('--port');
  start({ port: i > -1 ? Number(process.argv[i + 1]) : 3000 }).then((s) => console.log(`Serving public/ at ${s.origin} (API: ${s.origin}/api/contact)`));
}
