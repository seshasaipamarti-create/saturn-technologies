'use strict';
/**
 * POST /api/contact  (Vercel serverless function)
 *
 * Receives the enquiry form, validates everything on the server, applies spam protection and rate
 * limiting, then emails the enquiry to the business using the Resend HTTP API.
 *
 * Secrets come ONLY from environment variables (set them in Vercel > Project > Settings > Environment Variables):
 *   RESEND_API_KEY      API key from resend.com
 *   CONTACT_TO_EMAIL    where enquiries are delivered (your business inbox)
 *   CONTACT_FROM_EMAIL  a sender address on a domain verified in Resend, e.g. "Saturn Website <enquiries@yourdomain.com>"
 *   ALLOWED_ORIGINS     optional, comma separated extra origins allowed to post (your own domain is allowed automatically)
 *
 * If those variables are missing the endpoint answers 503 and says so. It never pretends to have sent anything.
 * There is no database: enquiries are delivered by email only.
 */
const { SERVICE_OPTIONS, BUDGETS } = require('../src/options');
const { siteUrl } = require('../site.config.json');

const SERVICES = new Map(SERVICE_OPTIONS);
const MAX_BODY_BYTES = 20 * 1024;
const MIN_FILL_MS = 3000;            // humans take longer than this to fill the form
const MAX_FORM_AGE_MS = 24 * 3600e3; // stale page
const LIMIT_PER_IP = { max: 5, windowMs: 15 * 60e3 };
const LIMIT_GLOBAL = { max: 200, windowMs: 60 * 60e3 };

// In-memory rate limiting. On serverless this is per warm instance (best effort), which stops simple floods.
// For a hard guarantee, back it with a shared store such as Upstash Redis / Vercel KV.
const hits = new Map();
function rateLimited(key, { max, windowMs }, now = Date.now()) {
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) { hits.set(key, arr); return true; }
  arr.push(now); hits.set(key, arr);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > 3600e3) hits.delete(k);
  return false;
}

const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\r\n?/g, '\n').trim().slice(0, max);
const oneLine = (v, max) => clean(v, max).replace(/\s+/g, ' ');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function validate(b, now = Date.now()) {
  const errors = {};
  const v = {
    name: oneLine(b.name, 100), company: oneLine(b.company, 120), email: oneLine(b.email, 160).toLowerCase(),
    phone: oneLine(b.phone, 20), service: oneLine(b.service, 40), budget: oneLine(b.budget, 40), message: clean(b.message, 3000)
  };
  if (v.name.length < 2) errors.name = 'Please enter your full name.';
  if (!/^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i.test(v.email)) errors.email = 'Please enter a valid email address.';
  const digits = v.phone.replace(/\D/g, '');
  if (!/^[+\d][\d\s()\-+]*$/.test(v.phone) || digits.length < 8 || digits.length > 15) errors.phone = 'Please enter a valid phone number.';
  if (!SERVICES.has(v.service)) errors.service = 'Please choose a service.';
  if (v.budget && !BUDGETS.includes(v.budget)) errors.budget = 'Please choose one of the listed budgets.';
  if (v.message.length < 20) errors.message = 'Please describe your project in at least 20 characters.';
  if ((v.message.match(/https?:\/\//gi) || []).length > 2) errors.message = 'Please remove extra links from your message.';
  const t = Number(b.t);
  const age = now - t;
  const tooFast = !Number.isFinite(t) || age < MIN_FILL_MS;
  const stale = Number.isFinite(t) && age > MAX_FORM_AGE_MS;
  return { v, errors, tooFast, stale };
}

function buildEmail(v) {
  const service = SERVICES.get(v.service);
  const subject = oneLine(`New enquiry: ${service} from ${v.name}`, 150);
  const rows = [['Name', v.name], ['Company', v.company || '-'], ['Email', v.email], ['Phone', v.phone], ['Service', service], ['Budget', v.budget || 'Not given']];
  const text = rows.map(([k, x]) => `${k}: ${x}`).join('\n') + `\n\nProject description:\n${v.message}\n`;
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#0e1d33"><h2 style="margin:0 0 12px">New website enquiry</h2><table cellpadding="6" style="border-collapse:collapse">` +
    rows.map(([k, x]) => `<tr><td style="color:#52607a;vertical-align:top">${esc(k)}</td><td><strong>${esc(x)}</strong></td></tr>`).join('') +
    `</table><h3 style="margin:18px 0 6px">Project description</h3><p style="white-space:pre-wrap;margin:0">${esc(v.message)}</p></div>`;
  return { subject, text, html };
}

const send = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
};

function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // same-origin form posts from some browsers omit it; cross-site posts always send it
  let host; try { host = new URL(origin).host; } catch { return false; }
  const allowed = new Set([req.headers.host, new URL(siteUrl).host, ...String(process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean).map((s) => { try { return new URL(s).host; } catch { return s; } })]);
  return allowed.has(host);
}

function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
  if (typeof req.body === 'string') { try { return Promise.resolve(parseBody(req.body, req.headers['content-type'])); } catch (e) { return Promise.reject(e); } }
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY_BYTES) { reject(Object.assign(new Error('too large'), { code: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(parseBody(Buffer.concat(chunks).toString('utf8'), req.headers['content-type'])); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
function parseBody(raw, type = '') {
  if (/json/i.test(type)) return JSON.parse(raw || '{}');
  return Object.fromEntries(new URLSearchParams(raw));
}

async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(res, 405, { ok: false, message: 'Method not allowed.' }); }
  if (!originAllowed(req)) return send(res, 403, { ok: false, message: 'Request not allowed.' });
  if (Number(req.headers['content-length'] || 0) > MAX_BODY_BYTES) return send(res, 413, { ok: false, message: 'Your message is too long.' });

  const ip = String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || (req.socket && req.socket.remoteAddress) || 'unknown').split(',')[0].trim();
  if (rateLimited('g', LIMIT_GLOBAL) || rateLimited('ip:' + ip, LIMIT_PER_IP)) {
    res.setHeader('Retry-After', '900');
    return send(res, 429, { ok: false, message: 'Too many enquiries were sent. Please try again later.' });
  }

  let body;
  try { body = await readBody(req); } catch (e) {
    return send(res, e.code === 413 ? 413 : 400, { ok: false, message: e.code === 413 ? 'Your message is too long.' : 'We could not read your enquiry. Please try again.' });
  }
  if (!body || typeof body !== 'object') return send(res, 400, { ok: false, message: 'We could not read your enquiry. Please try again.' });

  // Honeypot: real visitors never see this field. Pretend success so bots learn nothing.
  if (clean(body.website, 200) !== '') return send(res, 200, { ok: true });

  const { v, errors, tooFast, stale } = validate(body);
  if (stale) return send(res, 400, { ok: false, message: 'This page has been open for a long time. Please refresh it and send your enquiry again.' });
  if (tooFast) return send(res, 400, { ok: false, message: 'That was very quick. Please check your details and send again.' });
  if (Object.keys(errors).length) return send(res, 400, { ok: false, message: 'Please correct the highlighted fields.', errors });

  const { RESEND_API_KEY, CONTACT_TO_EMAIL, CONTACT_FROM_EMAIL } = process.env;
  if (!RESEND_API_KEY || !CONTACT_TO_EMAIL || !CONTACT_FROM_EMAIL) {
    console.error('[contact] not configured: set RESEND_API_KEY, CONTACT_TO_EMAIL and CONTACT_FROM_EMAIL');
    return send(res, 503, { ok: false, code: 'not_configured', message: 'The enquiry form is temporarily unavailable. Please contact us by email or WhatsApp instead.' });
  }

  const mail = buildEmail(v);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: ctrl.signal,
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: CONTACT_FROM_EMAIL, to: [CONTACT_TO_EMAIL], reply_to: v.email, subject: mail.subject, text: mail.text, html: mail.html })
    });
    if (!r.ok) { console.error('[contact] provider responded', r.status); return send(res, 502, { ok: false, message: 'We could not send your enquiry right now. Please try again in a few minutes or contact us directly.' }); }
  } catch (e) {
    console.error('[contact] delivery failed:', e && e.name);
    return send(res, 502, { ok: false, message: 'We could not send your enquiry right now. Please try again in a few minutes or contact us directly.' });
  } finally { clearTimeout(timer); }

  return send(res, 200, { ok: true, message: 'Thank you. Your enquiry has been sent and we will get back to you.' });
}

module.exports = handler;
module.exports._test = { validate, buildEmail, rateLimited, hits };
