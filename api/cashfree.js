'use strict';
/**
 * /api/cashfree (Vercel Serverless Function & local dev handler)
 *
 * Integrates Cashfree Payment Gateway (PG v2023-08-01):
 * - Order creation (server-enforced ₹5,000 fee)
 * - Payment verification (server-to-server Cashfree API inspection)
 * - Webhook processing with cryptographic HMAC-SHA256 signature verification
 * - Secure sandbox / production environment support
 */
const crypto = require('crypto');
const db = require('../src/db');
const { siteUrl } = require('../site.config.json');

const MAX_BODY_BYTES = 30 * 1024;

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
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    const bearerToken = auth.slice(7).trim();
    const sessionData = await db.getSession(bearerToken);
    if (sessionData) return { token: bearerToken, sessionData };
  }

  const cookies = parseCookies(req);
  if (cookies.saturn_student_session) {
    const cookieToken = cookies.saturn_student_session;
    const sessionData = await db.getSession(cookieToken);
    if (sessionData) return { token: cookieToken, sessionData };
  }

  const anyToken = (auth && auth.startsWith('Bearer ') && auth.slice(7).trim()) || cookies.saturn_student_session || null;
  return { token: anyToken, sessionData: null };
}

async function extractToken(req) {
  const session = await extractSession(req);
  return session.token;
}

function readBodyWithRaw(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return Promise.resolve({ parsed: req.body, raw: JSON.stringify(req.body) });
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
      const raw = Buffer.concat(chunks).toString('utf8');
      let parsed = {};
      try {
        if (/json/i.test(req.headers['content-type'] || '')) {
          parsed = JSON.parse(raw || '{}');
        } else {
          parsed = Object.fromEntries(new URLSearchParams(raw));
        }
      } catch (e) {
        return reject(e);
      }
      resolve({ parsed, raw });
    });
    req.on('error', reject);
  });
}

function getCashfreeConfig() {
  const appId = process.env.CASHFREE_APP_ID || process.env.CASHFREE_CLIENT_ID || '';
  const secretKey = process.env.CASHFREE_SECRET_KEY || process.env.CASHFREE_CLIENT_SECRET || '';
  const env = String(process.env.CASHFREE_ENV || 'SANDBOX').trim().toUpperCase();
  const baseUrl = env === 'PRODUCTION' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg';
  const apiVersion = '2023-08-01';

  return { appId, secretKey, env, baseUrl, apiVersion, isConfigured: Boolean(appId && secretKey) };
}

/**
 * Normalizes Indian phone numbers to 10-digit mobile format (^[6-9]\d{9}$).
 * Returns 10-digit string if valid, or null if invalid.
 */
function normalizeIndianPhone(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  if (/^[6-9]\d{9}$/.test(digits)) {
    return digits;
  }
  return null;
}

/**
 * Resolves the base URL for Cashfree payment return_url.
 * - In Vercel and production environments: strictly uses the trusted siteUrl from site.config.json.
 * - In local development ONLY: allows configured local development origin or strictly verified loopback host.
 * - Never constructs a return URL from an arbitrary untrusted Host or Origin header.
 */
function getPaymentReturnBaseUrl(req) {
  const isVercel = Boolean(process.env.VERCEL && String(process.env.VERCEL).trim());
  const isProduction = process.env.NODE_ENV === 'production';

  // 1. In Vercel or any production environment: strictly enforce trusted siteUrl from config
  if (isVercel || isProduction) {
    return siteUrl.replace(/\/+$/, '');
  }

  // 2. Local development ONLY: check configured local origin (must be loopback)
  const configuredLocalOrigin = (process.env.LOCAL_APP_URL || process.env.LOCAL_DEV_ORIGIN || '').trim();
  if (configuredLocalOrigin) {
    try {
      const u = new URL(configuredLocalOrigin);
      const h = u.hostname.toLowerCase();
      if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]') {
        return u.origin.replace(/\/+$/, '');
      }
    } catch (_) {}
  }

  // 3. Local development ONLY: validate incoming Host header against strict loopback allowlist
  const hostHeader = (req && req.headers && req.headers.host) ? String(req.headers.host).trim().toLowerCase() : '';
  const localHostMatch = hostHeader.match(/^(localhost|127\.0\.0\.1|\[::1\])(?::(\d{1,5}))?$/);
  if (localHostMatch) {
    const port = localHostMatch[2] ? `:${localHostMatch[2]}` : '';
    const hostname = localHostMatch[1];
    return `http://${hostname}${port}`;
  }

  // 4. Safe default for local development
  return 'http://localhost:3000';
}

async function verifyCashfreeOrderFromApi(orderId, cfConfig) {
  if (!cfConfig.isConfigured) {
    return null;
  }

  const url = `${cfConfig.baseUrl}/orders/${encodeURIComponent(orderId)}`;
  const resp = await fetch(url, {
    method: 'GET',
    headers: {
      'x-client-id': cfConfig.appId,
      'x-client-secret': cfConfig.secretKey,
      'x-api-version': cfConfig.apiVersion,
      'Content-Type': 'application/json'
    }
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error(`[Cashfree Fetch Order Error ${resp.status}]:`, errText);
    return null;
  }

  const orderData = await resp.json();

  // Also query payments list to retrieve payment method & cf_payment_id
  let paymentDetails = null;
  try {
    const payResp = await fetch(`${url}/payments`, {
      method: 'GET',
      headers: {
        'x-client-id': cfConfig.appId,
        'x-client-secret': cfConfig.secretKey,
        'x-api-version': cfConfig.apiVersion,
        'Content-Type': 'application/json'
      }
    });
    if (payResp.ok) {
      const payments = await payResp.json();
      if (Array.isArray(payments) && payments.length > 0) {
        paymentDetails = payments.find((p) => p.payment_status === 'SUCCESS') || payments[0];
      }
    }
  } catch (e) {
    console.error('[Cashfree Payments List Error]:', e.message);
  }

  return { order: orderData, payment: paymentDetails };
}

function verifyWebhookSignature(rawBody, signature, timestamp, secretKey) {
  if (!signature || !timestamp || !secretKey || typeof rawBody !== 'string') return false;
  try {
    const expected = crypto
      .createHmac('sha256', secretKey)
      .update(String(timestamp) + rawBody)
      .digest('base64');
    const expectedBuf = Buffer.from(expected, 'utf8');
    const sigBuf = Buffer.from(String(signature), 'utf8');
    if (expectedBuf.length !== sigBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(expectedBuf, sigBuf);
  } catch (_) {
    return false;
  }
}

async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname.replace(/\/+$/, '');
  const searchAction = url.searchParams.get('action');

  let action = searchAction || '';
  if (pathname.endsWith('/create-order')) action = 'create-order';
  else if (pathname.endsWith('/verify-order') || pathname.endsWith('/verify')) action = 'verify-order';
  else if (pathname.endsWith('/webhook')) action = 'webhook';

  const cfConfig = getCashfreeConfig();

  // 1. VERIFY ORDER STATUS (GET or POST)
  if (action === 'verify-order') {
    const orderId = url.searchParams.get('order_id') || url.searchParams.get('orderId');
    if (!orderId) {
      return send(res, 400, { ok: false, message: 'Missing order_id parameter.' });
    }

    const enrollment = await db.getEnrollmentByOrderId(orderId);
    if (!enrollment) {
      return send(res, 404, { ok: false, message: 'No course enrollment found for this order ID.' });
    }

    // If already verified as PAID, return immediately (idempotent)
    if (enrollment.status === 'PAID') {
      return send(res, 200, {
        ok: true,
        status: 'PAID',
        message: 'Course registration fee has been successfully verified.',
        enrollment
      });
    }

    // Query Cashfree Server API
    if (cfConfig.isConfigured) {
      const cfResult = await verifyCashfreeOrderFromApi(orderId, cfConfig);
      if (cfResult && cfResult.order) {
        const orderStatus = String(cfResult.order.order_status || '').toUpperCase();
        if (orderStatus === 'PAID') {
          const cfPaymentId = cfResult.payment ? cfResult.payment.cf_payment_id : String(cfResult.order.cf_order_id);
          const paymentMethod = cfResult.payment ? (cfResult.payment.payment_group || cfResult.payment.payment_method) : 'CASHFREE';
          const paymentTimestamp = (cfResult.payment && cfResult.payment.payment_time) || new Date().toISOString();

          const updated = await db.markEnrollmentPaid({
            orderId,
            cfPaymentId,
            paymentMethod,
            paymentTimestamp,
            rawDetails: cfResult
          });

          return send(res, 200, {
            ok: true,
            status: 'PAID',
            message: 'Payment verified successfully! Welcome to the course.',
            enrollment: updated
          });
        }

        if (orderStatus === 'EXPIRED' || orderStatus === 'CANCELLED' || orderStatus === 'FAILED') {
          await db.markEnrollmentFailed({ orderId, rawDetails: cfResult });
          return send(res, 200, {
            ok: false,
            status: 'FAILED',
            message: 'Payment was not completed or has expired. Please try again.'
          });
        }

        return send(res, 200, {
          ok: false,
          status: 'PENDING',
          message: 'Payment confirmation is still pending with Cashfree. Please wait.'
        });
      }
    }

    // Fail closed: without configured gateway credentials, unverified orders cannot be marked PAID
    if (!cfConfig.isConfigured) {
      return send(res, 503, {
        ok: false,
        code: 'GATEWAY_NOT_CONFIGURED',
        message: 'Cashfree payment gateway is not configured.'
      });
    }

    return send(res, 200, {
      ok: false,
      status: enrollment.status,
      message: 'Payment status is currently ' + enrollment.status
    });
  }

  // Parse Body for POST requests
  let parsedBody = {};
  let rawBodyText = '';
  if (req.method === 'POST') {
    try {
      const b = await readBodyWithRaw(req);
      parsedBody = b.parsed || {};
      rawBodyText = b.raw || '';
    } catch (e) {
      return send(res, 400, { ok: false, message: 'Invalid payload.' });
    }
  }

  if (!action && parsedBody.action) {
    action = String(parsedBody.action).trim();
  }

  // 2. CREATE ORDER
  if (action === 'create-order') {
    const { token, sessionData } = await extractSession(req);
    if (!token) {
      return send(res, 401, { ok: false, message: 'You must be logged in to register for the course.' });
    }
    if (!sessionData || !sessionData.student) {
      return send(res, 401, { ok: false, message: 'Session expired. Please log in again.' });
    }

    const student = sessionData.student;

    // Check if already paid
    if (await db.isStudentPaid(student.id)) {
      return send(res, 400, {
        ok: false,
        code: 'ALREADY_PAID',
        message: 'You have already enrolled in and paid for this course.'
      });
    }

    // Optional referral code validation
    const referralCode = parsedBody.referralCode ? String(parsedBody.referralCode).trim().toUpperCase() : null;
    if (referralCode) {
      const checkRef = await db.validateReferralCode(referralCode, student.id);
      if (!checkRef.valid) {
        return send(res, 400, {
          ok: false,
          code: 'INVALID_REFERRAL',
          message: checkRef.message
        });
      }
    }

    // Validate customer phone number (10-digit Indian mobile format)
    const normalizedPhone = normalizeIndianPhone(student.contactNumber);
    if (!normalizedPhone) {
      return send(res, 400, {
        ok: false,
        code: 'INVALID_PHONE_NUMBER',
        message: 'A valid 10-digit Indian mobile number starting with 6, 7, 8, or 9 is required for course registration.'
      });
    }

    // Amount is FIXED on backend: ₹5,000 INR
    const orderAmount = db.COURSE_FEE;
    const orderCurrency = db.COURSE_CURRENCY;
    const orderId = `order_${student.id.replace(/[^a-zA-Z0-9]/g, '').slice(-8)}_${Date.now()}`;

    // Create / update enrollment record
    const enrollment = await db.createOrUpdateEnrollment({
      studentId: student.id,
      referralCodeUsed: referralCode,
      orderId
    });

    // Call Cashfree API to generate session
    if (cfConfig.isConfigured) {
      try {
        const returnBaseUrl = getPaymentReturnBaseUrl(req);
        const returnUrl = `${returnBaseUrl}/training/course-registration?order_id={order_id}`;
        const cfPayload = {
          order_id: orderId,
          order_amount: orderAmount,
          order_currency: orderCurrency,
          customer_details: {
            customer_id: student.id,
            customer_email: student.email,
            customer_phone: normalizedPhone
          },
          order_meta: {
            return_url: returnUrl
          },
          order_note: `${db.COURSE_NAME} - Saturn Technologies`
        };

        const cfResp = await fetch(`${cfConfig.baseUrl}/orders`, {
          method: 'POST',
          headers: {
            'x-client-id': cfConfig.appId,
            'x-client-secret': cfConfig.secretKey,
            'x-api-version': cfConfig.apiVersion,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(cfPayload)
        });

        const cfOrder = await cfResp.json();
        if (!cfResp.ok) {
          console.error('[Cashfree Create Order Error]:', cfOrder);
          return send(res, 502, {
            ok: false,
            message: (cfOrder && cfOrder.message) || 'Payment gateway order initialization failed.'
          });
        }

        return send(res, 200, {
          ok: true,
          orderId,
          paymentSessionId: cfOrder.payment_session_id,
          amount: orderAmount,
          currency: orderCurrency,
          environment: cfConfig.env.toLowerCase(),
          courseName: db.COURSE_NAME
        });
      } catch (err) {
        console.error('[Cashfree Network Error]:', err);
        return send(res, 502, {
          ok: false,
          message: 'Could not connect to Cashfree payment gateway. Please try again.'
        });
      }
    }

    // Fail closed: without configured gateway credentials, mock sessions are strictly forbidden
    return send(res, 503, {
      ok: false,
      code: 'GATEWAY_NOT_CONFIGURED',
      message: 'Payment gateway is currently not configured. Please contact administration.'
    });
  }

  // 3. WEBHOOK NOTIFICATIONS (Fail-Closed HMAC-SHA256 Signature Verification)
  if (action === 'webhook') {
    if (!cfConfig.secretKey) {
      return send(res, 503, {
        ok: false,
        code: 'GATEWAY_NOT_CONFIGURED',
        message: 'Cashfree webhook secret is not configured.'
      });
    }

    const signature = req.headers['x-webhook-signature'];
    const timestamp = req.headers['x-webhook-timestamp'];

    if (!signature || !timestamp) {
      return send(res, 400, {
        ok: false,
        code: 'MISSING_SIGNATURE_HEADERS',
        message: 'Missing required webhook signature or timestamp headers.'
      });
    }

    // Verify timestamp skew (< 15 mins)
    const tsStr = String(timestamp).trim();
    let tsMs = Number(tsStr);
    if (!Number.isNaN(tsMs)) {
      if (tsMs < 1e11) tsMs *= 1000; // seconds to ms
    } else {
      tsMs = Date.parse(tsStr);
    }

    if (!tsMs || Number.isNaN(tsMs)) {
      return send(res, 400, {
        ok: false,
        code: 'INVALID_TIMESTAMP',
        message: 'Invalid webhook timestamp header.'
      });
    }

    const skewMs = Math.abs(Date.now() - tsMs);
    const MAX_SKEW_MS = 15 * 60 * 1000; // 15 minutes
    if (skewMs > MAX_SKEW_MS) {
      return send(res, 401, {
        ok: false,
        code: 'TIMESTAMP_OUT_OF_TOLERANCE',
        message: 'Webhook timestamp tolerance exceeded.'
      });
    }

    const isValid = verifyWebhookSignature(rawBodyText, signature, timestamp, cfConfig.secretKey);
    if (!isValid) {
      return send(res, 401, {
        ok: false,
        code: 'INVALID_SIGNATURE',
        message: 'Invalid webhook signature.'
      });
    }

    if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
      return send(res, 400, {
        ok: false,
        code: 'MALFORMED_PAYLOAD',
        message: 'Malformed webhook payload.'
      });
    }

    const orderData = (parsedBody.data && parsedBody.data.order) || parsedBody.order || {};
    const paymentData = (parsedBody.data && parsedBody.data.payment) || parsedBody.payment || {};
    const orderId = orderData.order_id || parsedBody.order_id;

    if (!orderId) {
      return send(res, 400, {
        ok: false,
        code: 'MISSING_ORDER_ID',
        message: 'No order ID in webhook payload.'
      });
    }

    const paymentStatus = String(
      paymentData.payment_status || orderData.order_status || parsedBody.type || ''
    ).toUpperCase();

    if (paymentStatus === 'SUCCESS' || paymentStatus === 'PAID' || paymentStatus === 'PAYMENT_SUCCESS_WEBHOOK') {
      const cfPaymentId = paymentData.cf_payment_id != null
        ? String(paymentData.cf_payment_id)
        : String(orderData.cf_order_id || '');
      const paymentMethod = paymentData.payment_group ||
        (typeof paymentData.payment_method === 'string'
          ? paymentData.payment_method
          : (paymentData.payment_method ? Object.keys(paymentData.payment_method)[0] : 'WEBHOOK')) ||
        'WEBHOOK';
      const paymentTime = paymentData.payment_time || new Date().toISOString();

      await db.markEnrollmentPaid({
        orderId,
        cfPaymentId,
        paymentMethod,
        paymentTimestamp: paymentTime,
        rawDetails: parsedBody
      });
    } else if (paymentStatus === 'FAILED' || paymentStatus === 'CANCELLED' || paymentStatus === 'USER_DROPPED' || paymentStatus === 'PAYMENT_FAILED_WEBHOOK') {
      await db.markEnrollmentFailed({ orderId, rawDetails: parsedBody });
    }

    return send(res, 200, { ok: true, message: 'Webhook processed.' });
  }

  return send(res, 400, { ok: false, message: 'Unknown Cashfree action.' });
}

handler.normalizeIndianPhone = normalizeIndianPhone;
handler.verifyWebhookSignature = verifyWebhookSignature;
handler.getCashfreeConfig = getCashfreeConfig;
handler.getPaymentReturnBaseUrl = getPaymentReturnBaseUrl;

module.exports = handler;
