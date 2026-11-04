'use strict';
/**
 * /api/student (Vercel Serverless Function & local dev handler)
 *
 * Handles student registration, authentication, session retrieval, and logout.
 * Pure Node.js built-ins, zero external dependencies.
 */
const db = require('../src/db');
const { siteUrl } = require('../site.config.json');

const MAX_BODY_BYTES = 20 * 1024;

const clean = (v, max = 255) =>
  String(v == null ? '' : v)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);

const send = (res, status, body, extraHeaders = {}) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  for (const [k, v] of Object.entries(extraHeaders)) {
    res.setHeader(k, v);
  }
  res.end(JSON.stringify(body));
};

function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  const cookies = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > -1) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      cookies[k] = decodeURIComponent(v);
    }
  }
  return cookies;
}

async function extractSession(req) {
  // Check Authorization Bearer header first (most specific from active frontend session)
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    const bearerToken = auth.slice(7).trim();
    const sessionData = await db.getSession(bearerToken);
    if (sessionData) return { token: bearerToken, sessionData };
  }

  // Check Cookie
  const cookies = parseCookies(req);
  if (cookies.saturn_student_session) {
    const cookieToken = cookies.saturn_student_session;
    const sessionData = await db.getSession(cookieToken);
    if (sessionData) return { token: cookieToken, sessionData };
  }

  // Fallback if neither yielded an active session
  const anyToken = (auth && auth.startsWith('Bearer ') && auth.slice(7).trim()) || cookies.saturn_student_session || null;
  return { token: anyToken, sessionData: null };
}

async function extractToken(req) {
  const session = await extractSession(req);
  return session.token;
}

function getClientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (xf) return xf.split(',')[0].trim();
  return req.headers['x-real-ip'] || (req.socket && req.socket.remoteAddress) || '127.0.0.1';
}

function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  const hostname = originHost.split(':')[0];
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') {
    return true;
  }
  const allowed = new Set([
    req.headers.host,
    new URL(siteUrl).host,
    ...String(process.env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        try {
          return new URL(s).host;
        } catch {
          return s;
        }
      })
  ]);
  return allowed.has(originHost);
}

function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return Promise.resolve(req.body);
  }
  if (typeof req.body === 'string') {
    try {
      return Promise.resolve(parseBody(req.body, req.headers['content-type']));
    } catch (e) {
      return Promise.reject(e);
    }
  }
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Payload too large'), { code: 413 }));
        req.destroy();
      } else {
        chunks.push(c);
      }
    });
    req.on('end', () => {
      try {
        resolve(parseBody(Buffer.concat(chunks).toString('utf8'), req.headers['content-type']));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function parseBody(raw, type = '') {
  if (!raw) return {};
  if (/json/i.test(type)) return JSON.parse(raw);
  return Object.fromEntries(new URLSearchParams(raw));
}

function validateEmail(email) {
  return /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i.test(email);
}

function validatePhone(phone) {
  const digits = phone.replace(/\D/g, '');
  return /^[+\d][\d\s()\-+]*$/.test(phone) && digits.length >= 8 && digits.length <= 15;
}

async function handler(req, res) {
  if (!originAllowed(req)) {
    return send(res, 403, { ok: false, message: 'Request origin not allowed.' });
  }

  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname.replace(/\/+$/, '');
  const searchAction = url.searchParams.get('action');

  let action = searchAction || '';
  if (pathname.endsWith('/register')) action = 'register';
  else if (pathname.endsWith('/login')) action = 'login';
  else if (pathname.endsWith('/logout')) action = 'logout';
  else if (pathname.endsWith('/me')) action = 'me';
  else if (pathname.endsWith('/receipt')) action = 'receipt';
  else if (pathname.endsWith('/materials')) action = 'materials';
  else if (pathname.endsWith('/material-file')) action = 'material-file';

  // GET: Course Materials List (Feature 3)
  if (req.method === 'GET' && action === 'materials') {
    const { token, sessionData } = await extractSession(req);
    if (!token || !sessionData) {
      return send(res, 401, { ok: false, message: 'You must be logged in to view course materials.' });
    }

    const result = await db.getCourseMaterials({ studentId: sessionData.student.id });
    return send(res, result.status || (result.ok ? 200 : 403), result);
  }

  // GET: Specific Course Material PDF Stream (Feature 3)
  if (req.method === 'GET' && action === 'material-file') {
    const { token, sessionData } = await extractSession(req);
    if (!token || !sessionData) {
      return send(res, 401, { ok: false, message: 'You must be logged in to view course materials.' });
    }

    const materialId = url.searchParams.get('id') || url.searchParams.get('material_id');
    const result = await db.getCourseMaterialFile({
      studentId: sessionData.student.id,
      materialId
    });

    if (!result.ok) {
      return send(res, result.status || 403, {
        ok: false,
        error: result.error,
        message: result.message || 'Unable to load course material.'
      });
    }

    // Set secure inline PDF headers (no attachments, no public caching)
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', result.size);
    res.setHeader('Content-Disposition', 'inline; filename="' + result.material.fileName + '"');
    res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.end(result.buffer);
  }

  // GET: Specific Payment Receipt
  if (req.method === 'GET' && action === 'receipt') {
    const { token, sessionData } = await extractSession(req);
    if (!token || !sessionData) {
      return send(res, 401, { ok: false, message: 'You must be logged in to view payment receipts.' });
    }
    const paymentId = url.searchParams.get('payment_id') || url.searchParams.get('paymentId');
    if (!paymentId) {
      return send(res, 400, { ok: false, message: 'Missing payment_id parameter.' });
    }

    const receipt = await db.getPaymentReceipt({
      studentId: sessionData.student.id,
      paymentId
    });

    if (!receipt) {
      return send(res, 404, { ok: false, message: 'Payment record not found for your account.' });
    }

    if (!receipt.eligible) {
      return send(res, 400, {
        ok: false,
        status: receipt.status,
        message: receipt.message || 'Payment receipts are only generated for successfully verified payments.'
      });
    }

    return send(res, 200, {
      ok: true,
      receipt
    });
  }

  // GET: Session inspection (check if student is logged in)
  if (req.method === 'GET' || action === 'me') {
    const { token, sessionData } = await extractSession(req);
    if (!token) {
      return send(res, 401, { ok: false, message: 'Not logged in.' });
    }
    if (!sessionData) {
      return send(res, 401, { ok: false, message: 'Session expired or invalid.' });
    }
    const isPaid = await db.isStudentPaid(sessionData.student.id);
    const enrollment = await db.getStudentEnrollment(sessionData.student.id);
    const payments = await db.getStudentPayments(sessionData.student.id);
    const referral = await db.getStudentReferralSummary(sessionData.student.id);
    const materials = isPaid ? ((await db.getCourseMaterials({ studentId: sessionData.student.id })).materials || []) : [];
    return send(res, 200, {
      ok: true,
      student: sessionData.student,
      isPaid,
      enrollment,
      payments,
      referral,
      materials
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return send(res, 405, { ok: false, message: 'Method not allowed.' });
  }

  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return send(res, e.code === 413 ? 413 : 400, {
      ok: false,
      message: e.code === 413 ? 'Your request is too large.' : 'Invalid request payload.'
    });
  }

  if (!body || typeof body !== 'object') {
    return send(res, 400, { ok: false, message: 'Invalid request payload.' });
  }

  if (!action && body.action) {
    action = String(body.action).trim();
  }

  // 1. REGISTRATION
  if (action === 'register') {
    const email = clean(body.email, 160).toLowerCase();
    const contactNumber = clean(body.contactNumber || body.phone, 20);
    const collegeName = clean(body.collegeName, 150);
    const academicYear = clean(body.academicYear, 60);
    const degree = clean(body.degree || body.course, 80);
    const password = String(body.password || '');
    const confirmPassword = String(body.confirmPassword || '');

    const errors = {};
    if (!email || !validateEmail(email)) {
      errors.email = 'Please enter a valid email address.';
    }
    if (!contactNumber || !validatePhone(contactNumber)) {
      errors.contactNumber = 'Please enter a valid contact number (8 to 15 digits).';
    }
    if (!collegeName || collegeName.length < 2) {
      errors.collegeName = 'Please enter your college or institution name.';
    }
    if (!academicYear) {
      errors.academicYear = 'Please select your current academic year.';
    }
    if (!degree || degree.length < 2) {
      errors.degree = 'Please enter your degree or class (e.g. B.Tech, M.Tech, BCA).';
    }
    if (!password || password.length < 8) {
      errors.password = 'Password must be at least 8 characters long.';
    }
    if (password !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match.';
    }

    if (Object.keys(errors).length > 0) {
      return send(res, 400, {
        ok: false,
        message: 'Please correct the highlighted fields.',
        errors
      });
    }

    try {
      const student = await db.createStudent({
        email,
        contactNumber,
        collegeName,
        academicYear,
        degree,
        password
      });

      const { token, expiresAt } = await db.createSession(student.id);
      const maxAgeSeconds = Math.floor((expiresAt - Date.now()) / 1000);
      const cookieValue = `saturn_student_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`;

      return send(
        res,
        201,
        {
          ok: true,
          message: 'Registration successful! Proceeding to course registration...',
          student,
          token,
          isPaid: false
        },
        { 'Set-Cookie': cookieValue }
      );
    } catch (err) {
      if (err.code === 'EMAIL_EXISTS') {
        return send(res, 409, {
          ok: false,
          message: 'This email address is already registered. Please log in.',
          errors: { email: 'This email is already registered.' }
        });
      }
      console.error('[student register error]:', err);
      return send(res, 500, {
        ok: false,
        message: 'Registration could not be completed. Please try again.'
      });
    }
  }

  // 2. LOGIN
  if (action === 'login') {
    const email = clean(body.email, 160).toLowerCase();
    const password = String(body.password || '');

    const errors = {};
    if (!email || !validateEmail(email)) {
      errors.email = 'Please enter your registered email address.';
    }
    if (!password) {
      errors.password = 'Please enter your password.';
    }

    if (Object.keys(errors).length > 0) {
      return send(res, 400, {
        ok: false,
        message: 'Please provide both your registered email and password.',
        errors
      });
    }

    const ip = getClientIp(req);
    const rateCheck = await db.checkLoginRateLimit(ip, email);
    if (!rateCheck.allowed) {
      return send(res, 429, {
        ok: false,
        code: 'RATE_LIMITED',
        message: `Too many failed login attempts. Please wait ${rateCheck.retryAfterMinutes} minute(s) before trying again.`,
        retryAfterMinutes: rateCheck.retryAfterMinutes
      });
    }

    let student;
    try {
      student = await db.authenticateStudent(email, password);
    } catch (authErr) {
      if (authErr.code === 'ACCOUNT_DEACTIVATED') {
        await db.recordFailedLoginAttempt(ip, email);
        return send(res, 403, {
          ok: false,
          code: 'ACCOUNT_DEACTIVATED',
          message: authErr.message || 'Your account has been deactivated. Please contact the administrator.'
        });
      }
      throw authErr;
    }

    if (!student) {
      const attempt = await db.recordFailedLoginAttempt(ip, email);
      const remaining = Math.max(0, 5 - attempt.count);
      return send(res, 401, {
        ok: false,
        message: remaining > 0
          ? `Invalid email address or password. (${remaining} attempt${remaining === 1 ? '' : 's'} remaining)`
          : 'Invalid email address or password. Too many failed attempts. Account temporarily locked for 15 minutes.'
      });
    }

    // Login successful: clear rate limit
    await db.clearLoginRateLimit(ip, email);

    const { token, expiresAt } = await db.createSession(student.id);
    const maxAgeSeconds = Math.floor((expiresAt - Date.now()) / 1000);
    const cookieValue = `saturn_student_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`;

    const isPaid = await db.isStudentPaid(student.id);

    return send(
      res,
      200,
      {
        ok: true,
        message: 'Login successful. Redirecting...',
        token,
        student,
        isPaid
      },
      { 'Set-Cookie': cookieValue }
    );
  }

  // 3. LOGOUT
  if (action === 'logout') {
    const token = await extractToken(req);
    if (token) {
      await db.deleteSession(token);
    }
    const expireCookie = 'saturn_student_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
    return send(
      res,
      200,
      {
        ok: true,
        message: 'You have been logged out successfully.'
      },
      { 'Set-Cookie': expireCookie }
    );
  }

  // 4. VALIDATE REFERRAL CODE
  if (action === 'validate-referral') {
    const token = await extractToken(req);
    const sessionData = token ? await db.getSession(token) : null;
    const currentStudentId = sessionData ? sessionData.student.id : null;
    const code = clean(body.referralCode || body.code, 40);

    if (!code) {
      return send(res, 400, { ok: false, valid: false, message: 'Please enter a referral code to validate.' });
    }

    const check = await db.validateReferralCode(code, currentStudentId);
    if (!check.valid) {
      return send(res, 400, { ok: false, valid: false, message: check.message });
    }

    return send(res, 200, {
      ok: true,
      valid: true,
      message: 'Valid referral code applied.',
      referrerCode: check.referrerStudent.referralCode
    });
  }

  return send(res, 400, {
    ok: false,
    message: 'Unknown action requested.'
  });
}

module.exports = handler;
