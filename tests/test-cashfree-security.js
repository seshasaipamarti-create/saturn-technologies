'use strict';
/**
 * Security & Regression Test Suite for Cashfree Payment Gateway Corrections
 * Verifies:
 * 1. Removal of payment simulation bypass (simulate=success rejected)
 * 2. Cashfree Drop SDK v3 script integration in course-registration.html
 * 3. Fail-closed Cashfree webhook HMAC-SHA256 signature verification & timestamp tolerance
 * 4. Validation and normalization of Indian customer mobile numbers (^[6-9]\d{9}$)
 * 5. Payment idempotency and referral reward safety
 */
process.env.USE_LOCAL_JSON = '1';
process.env.FORCE_LOCAL_DB = '1';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../src/db');
const cashfreeHandler = require('../api/cashfree');

function mockReqRes(method, urlStr, body = null, headers = {}) {
  const req = {
    method,
    url: urlStr,
    headers: {
      host: 'localhost',
      'content-type': 'application/json',
      ...headers
    },
    body
  };

  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      headers: {},
      setHeader(k, v) {
        this.headers[k.toLowerCase()] = v;
      },
      getHeader(k) {
        return this.headers[k.toLowerCase()];
      },
      end(payload) {
        let parsed = null;
        try {
          parsed = JSON.parse(payload);
        } catch (_) {
          parsed = payload;
        }
        resolve({
          status: this.statusCode,
          headers: this.headers,
          body: parsed
        });
      }
    };

    cashfreeHandler(req, res).catch((err) => {
      resolve({ status: 500, headers: {}, body: { error: err.message } });
    });
  });
}

async function runSecurityTests() {
  console.log('=== Saturn Technologies — Cashfree Security & Integration Test Suite ===\n');
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      passed++;
      console.log(`  ✓ PASS: ${name}`);
    } catch (err) {
      failed++;
      console.error(`  ✗ FAIL: ${name} ->`, err.message);
    }
  }

  // ==========================================
  // SECTION 1: CUSTOMER PHONE VALIDATION
  // ==========================================
  console.log('[SECTION 1: Customer Phone Validation & Normalization]');

  await test('normalizeIndianPhone accepts standard 10-digit Indian numbers starting with 6, 7, 8, 9', () => {
    assert.strictEqual(cashfreeHandler.normalizeIndianPhone('9876543210'), '9876543210');
    assert.strictEqual(cashfreeHandler.normalizeIndianPhone('8123456789'), '8123456789');
    assert.strictEqual(cashfreeHandler.normalizeIndianPhone('7012345678'), '7012345678');
    assert.strictEqual(cashfreeHandler.normalizeIndianPhone('6345678901'), '6345678901');
  });

  await test('normalizeIndianPhone normalizes prefixes (+91, 91, leading 0, spaces, dashes)', () => {
    assert.strictEqual(cashfreeHandler.normalizeIndianPhone('+91 9876543210'), '9876543210');
    assert.strictEqual(cashfreeHandler.normalizeIndianPhone('+91-98765-43210'), '9876543210');
    assert.strictEqual(cashfreeHandler.normalizeIndianPhone('919876543210'), '9876543210');
    assert.strictEqual(cashfreeHandler.normalizeIndianPhone('09876543210'), '9876543210');
    assert.strictEqual(cashfreeHandler.normalizeIndianPhone('98765 43210'), '9876543210');
  });

  await test('normalizeIndianPhone rejects invalid numbers (too short, too long, non-Indian starting digits)', () => {
    assert.strictEqual(cashfreeHandler.normalizeIndianPhone('12345'), null);
    assert.strictEqual(cashfreeHandler.normalizeIndianPhone('5551234567'), null); // starts with 5
    assert.strictEqual(cashfreeHandler.normalizeIndianPhone('1800123456'), null); // starts with 1
    assert.strictEqual(cashfreeHandler.normalizeIndianPhone('9876543210123'), null); // too long
    assert.strictEqual(cashfreeHandler.normalizeIndianPhone('abcdefghij'), null);
    assert.strictEqual(cashfreeHandler.normalizeIndianPhone(''), null);
    assert.strictEqual(cashfreeHandler.normalizeIndianPhone(null), null);
    assert.strictEqual(cashfreeHandler.normalizeIndianPhone(undefined), null);
  });

  // Setup test students
  const validStudent = await db.createStudent({
    email: `valid_phone_${Date.now()}@saturn.in`,
    password: 'Password123#',
    contactNumber: '+91 98765 43210',
    collegeName: 'National Institute of Tech',
    academicYear: '3rd Year',
    degree: 'B.Tech CSE'
  });
  const validSession = await db.createSession(validStudent.id, 'STUDENT');

  const invalidPhoneStudent = await db.createStudent({
    email: `invalid_phone_${Date.now()}@saturn.in`,
    password: 'Password123#',
    contactNumber: '1234567', // invalid phone
    collegeName: 'Demo College',
    academicYear: '2nd Year',
    degree: 'B.Sc'
  });
  const invalidPhoneSession = await db.createSession(invalidPhoneStudent.id, 'STUDENT');

  await test('create-order rejects student with invalid phone number with HTTP 400 INVALID_PHONE_NUMBER', async () => {
    const res = await mockReqRes('POST', '/api/cashfree', {
      action: 'create-order'
    }, { authorization: `Bearer ${invalidPhoneSession.token}` });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.ok, false);
    assert.strictEqual(res.body.code, 'INVALID_PHONE_NUMBER');
  });

  // ==========================================
  // SECTION 2: FAIL-CLOSED GATEWAY CONFIGURATION
  // ==========================================
  console.log('\n[SECTION 2: Fail-Closed Gateway Configuration]');

  await test('create-order rejects unconfigured Cashfree gateway with HTTP 503 (no mock sessions)', async () => {
    delete process.env.CASHFREE_APP_ID;
    delete process.env.CASHFREE_SECRET_KEY;

    const res = await mockReqRes('POST', '/api/cashfree', {
      action: 'create-order'
    }, { authorization: `Bearer ${validSession.token}` });

    assert.strictEqual(res.status, 503);
    assert.strictEqual(res.body.ok, false);
    assert.strictEqual(res.body.code, 'GATEWAY_NOT_CONFIGURED');
    assert.strictEqual(res.body.paymentSessionId, undefined, 'Must not return mock session');
  });

  await test('verify-order rejects unconfigured Cashfree gateway with HTTP 503 on unverified order', async () => {
    delete process.env.CASHFREE_APP_ID;
    delete process.env.CASHFREE_SECRET_KEY;

    const dummyOrderId = `order_test_${Date.now()}`;
    await db.createOrUpdateEnrollment({
      studentId: validStudent.id,
      orderId: dummyOrderId
    });

    const res = await mockReqRes('GET', `/api/cashfree?action=verify-order&order_id=${dummyOrderId}`);
    assert.strictEqual(res.status, 503);
    assert.strictEqual(res.body.ok, false);
    assert.strictEqual(res.body.code, 'GATEWAY_NOT_CONFIGURED');
  });

  // ==========================================
  // SECTION 3: REMOVAL OF SIMULATION BYPASS
  // ==========================================
  console.log('\n[SECTION 3: Removal of Simulation Bypass]');

  await test('verify-order with simulate=success is completely ignored/rejected and cannot mark order PAID', async () => {
    delete process.env.CASHFREE_APP_ID;
    delete process.env.CASHFREE_SECRET_KEY;

    const simOrderId = `order_sim_test_${Date.now()}`;
    await db.createOrUpdateEnrollment({
      studentId: validStudent.id,
      orderId: simOrderId
    });

    // Attempt simulation bypass
    const res = await mockReqRes('GET', `/api/cashfree?action=verify-order&order_id=${simOrderId}&simulate=success`);
    assert.notStrictEqual(res.body.status, 'PAID', 'simulate=success MUST NOT return status PAID');

    // Confirm student and enrollment remain unpaid in database
    const enrollment = await db.getEnrollmentByOrderId(simOrderId);
    assert.strictEqual(enrollment.status, 'PENDING');
    assert.strictEqual(await db.isStudentPaid(validStudent.id), false);
  });

  // ==========================================
  // SECTION 4: FAIL-CLOSED WEBHOOK VERIFICATION
  // ==========================================
  console.log('\n[SECTION 4: Fail-Closed Cashfree Webhook Verification]');

  const testSecretKey = 'saturn_cf_secret_key_prod_test_4052';
  const orderIdForWebhook = `order_webhook_${Date.now()}`;
  await db.createOrUpdateEnrollment({
    studentId: validStudent.id,
    orderId: orderIdForWebhook
  });

  await test('webhook rejects requests if CASHFREE_SECRET_KEY is not configured (HTTP 503)', async () => {
    delete process.env.CASHFREE_SECRET_KEY;
    const res = await mockReqRes('POST', '/api/cashfree?action=webhook', { order_id: orderIdForWebhook });
    assert.strictEqual(res.status, 503);
    assert.strictEqual(res.body.code, 'GATEWAY_NOT_CONFIGURED');
  });

  await test('webhook rejects requests missing signature or timestamp headers (HTTP 400)', async () => {
    process.env.CASHFREE_SECRET_KEY = testSecretKey;
    const res = await mockReqRes('POST', '/api/cashfree?action=webhook', { order_id: orderIdForWebhook });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.code, 'MISSING_SIGNATURE_HEADERS');
  });

  await test('webhook rejects invalid timestamp header format (HTTP 400)', async () => {
    process.env.CASHFREE_SECRET_KEY = testSecretKey;
    const res = await mockReqRes('POST', '/api/cashfree?action=webhook', { order_id: orderIdForWebhook }, {
      'x-webhook-signature': 'some_sig',
      'x-webhook-timestamp': 'invalid-not-a-timestamp'
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.code, 'INVALID_TIMESTAMP');
  });

  await test('webhook rejects timestamp skew greater than 15 minutes (HTTP 401 replay prevention)', async () => {
    process.env.CASHFREE_SECRET_KEY = testSecretKey;
    const oldTimestamp = Date.now() - (16 * 60 * 1000); // 16 minutes ago
    const res = await mockReqRes('POST', '/api/cashfree?action=webhook', { order_id: orderIdForWebhook }, {
      'x-webhook-signature': 'dummy_sig',
      'x-webhook-timestamp': String(oldTimestamp)
    });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.code, 'TIMESTAMP_OUT_OF_TOLERANCE');
  });

  await test('webhook rejects forged / invalid HMAC-SHA256 signature (HTTP 401)', async () => {
    process.env.CASHFREE_SECRET_KEY = testSecretKey;
    const nowTs = Date.now();
    const payload = {
      type: 'PAYMENT_SUCCESS_WEBHOOK',
      data: {
        order: { order_id: orderIdForWebhook, order_amount: 5000 },
        payment: { cf_payment_id: 112233, payment_status: 'SUCCESS' }
      }
    };
    // Sign with WRONG secret
    const badSig = crypto.createHmac('sha256', 'wrong_secret').update(String(nowTs) + JSON.stringify(payload)).digest('base64');
    const res = await mockReqRes('POST', '/api/cashfree?action=webhook', payload, {
      'x-webhook-signature': badSig,
      'x-webhook-timestamp': String(nowTs)
    });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.code, 'INVALID_SIGNATURE');
  });

  await test('webhook safely handles different signature length without timing leak or uncaught exception', async () => {
    process.env.CASHFREE_SECRET_KEY = testSecretKey;
    const nowTs = Date.now();
    const payload = { type: 'PAYMENT_SUCCESS_WEBHOOK' };
    const shortSig = 'short';
    const res = await mockReqRes('POST', '/api/cashfree?action=webhook', payload, {
      'x-webhook-signature': shortSig,
      'x-webhook-timestamp': String(nowTs)
    });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.code, 'INVALID_SIGNATURE');
  });

  await test('webhook rejects missing order ID in payload (HTTP 400)', async () => {
    process.env.CASHFREE_SECRET_KEY = testSecretKey;
    const nowTs = Date.now();
    const payload = { type: 'PAYMENT_SUCCESS_WEBHOOK', data: {} };
    const rawBody = JSON.stringify(payload);
    const validSig = crypto.createHmac('sha256', testSecretKey).update(String(nowTs) + rawBody).digest('base64');

    const res = await mockReqRes('POST', '/api/cashfree?action=webhook', payload, {
      'x-webhook-signature': validSig,
      'x-webhook-timestamp': String(nowTs)
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.code, 'MISSING_ORDER_ID');
  });

  await test('webhook accepts valid HMAC-SHA256 signature and atomically marks enrollment PAID', async () => {
    process.env.CASHFREE_SECRET_KEY = testSecretKey;
    const nowTs = Date.now();
    const cfPaymentId = `cf_real_${Date.now()}`;
    const payload = {
      type: 'PAYMENT_SUCCESS_WEBHOOK',
      data: {
        order: {
          order_id: orderIdForWebhook,
          order_amount: 5000,
          order_currency: 'INR'
        },
        payment: {
          cf_payment_id: cfPaymentId,
          payment_status: 'SUCCESS',
          payment_group: 'upi',
          payment_time: new Date().toISOString()
        }
      }
    };
    const rawBody = JSON.stringify(payload);
    const validSig = crypto.createHmac('sha256', testSecretKey).update(String(nowTs) + rawBody).digest('base64');

    const res = await mockReqRes('POST', '/api/cashfree?action=webhook', payload, {
      'x-webhook-signature': validSig,
      'x-webhook-timestamp': String(nowTs)
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.ok, true);

    // Confirm DB updated to PAID
    const enrollment = await db.getEnrollmentByOrderId(orderIdForWebhook);
    assert.strictEqual(enrollment.status, 'PAID');
    assert.strictEqual(await db.isStudentPaid(validStudent.id), true);
  });

  await test('duplicate webhook delivery for already-paid order is safely idempotent', async () => {
    process.env.CASHFREE_SECRET_KEY = testSecretKey;
    const nowTs = Date.now();
    const payload = {
      type: 'PAYMENT_SUCCESS_WEBHOOK',
      data: {
        order: { order_id: orderIdForWebhook, order_amount: 5000 },
        payment: { cf_payment_id: 'cf_duplicate_test', payment_status: 'SUCCESS' }
      }
    };
    const rawBody = JSON.stringify(payload);
    const validSig = crypto.createHmac('sha256', testSecretKey).update(String(nowTs) + rawBody).digest('base64');

    const res = await mockReqRes('POST', '/api/cashfree?action=webhook', payload, {
      'x-webhook-signature': validSig,
      'x-webhook-timestamp': String(nowTs)
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.ok, true);

    const enrollment = await db.getEnrollmentByOrderId(orderIdForWebhook);
    assert.strictEqual(enrollment.status, 'PAID');
  });

  // ==========================================
  // SECTION 5: FRONTEND ARTIFACT INTEGRITY
  // ==========================================
  console.log('\n[SECTION 5: Frontend SDK & Code Integrity]');

  await test('course-registration.html includes official Cashfree Drop SDK v3 before student.js', () => {
    const htmlPath = path.join(__dirname, '..', 'public', 'training', 'course-registration.html');
    assert(fs.existsSync(htmlPath), 'course-registration.html must exist');
    const html = fs.readFileSync(htmlPath, 'utf8');

    const sdkIndex = html.indexOf('https://sdk.cashfree.com/js/v3/cashfree.js');
    const studentJsIndex = html.indexOf('/assets/js/student.js');

    assert(sdkIndex !== -1, 'Must include official Cashfree SDK script tag');
    assert(studentJsIndex !== -1, 'Must include student.js script tag');
    assert(sdkIndex < studentJsIndex, 'Cashfree SDK must load BEFORE student.js');
  });

  await test('assets/js/student.js and public/assets/js/student.js contain zero simulate=success references', () => {
    const srcJs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'student.js'), 'utf8');
    const pubJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'js', 'student.js'), 'utf8');

    assert(!srcJs.includes('simulate=success'), 'assets/js/student.js must not contain simulate=success');
    assert(!pubJs.includes('simulate=success'), 'public/assets/js/student.js must not contain simulate=success');
    assert(!srcJs.includes('simulate'), 'assets/js/student.js must not contain simulate parameter extraction');
  });

  await test('api/cashfree.js contains zero simulate references or mock session generation', () => {
    const apiCode = fs.readFileSync(path.join(__dirname, '..', 'api', 'cashfree.js'), 'utf8');
    assert(!apiCode.includes('simulate'), 'api/cashfree.js must not contain simulate logic');
    assert(!apiCode.includes('session_sandbox_mock_'), 'api/cashfree.js must not return session_sandbox_mock_');
    assert(!apiCode.includes('9876543210'), 'api/cashfree.js must not contain dummy fallback 9876543210');
  });

  // ==========================================
  // SECTION 6: RETURN URL SELECTION & SECURITY
  // ==========================================
  console.log('\n[SECTION 6: Return URL Selection & Origin Security]');

  const { siteUrl } = require('../site.config.json');
  const expectedProdBase = siteUrl.replace(/\/+$/, '');

  await test('getPaymentReturnBaseUrl strictly uses site.config.json in Vercel, ignoring Host header', () => {
    const savedVercel = process.env.VERCEL;
    const savedNodeEnv = process.env.NODE_ENV;
    try {
      process.env.VERCEL = '1';
      process.env.NODE_ENV = 'development';

      const reqWithLocalHost = { headers: { host: 'localhost:3000' } };
      assert.strictEqual(cashfreeHandler.getPaymentReturnBaseUrl(reqWithLocalHost), expectedProdBase);

      const reqWithUntrustedHost = { headers: { host: 'attacker.com' } };
      assert.strictEqual(cashfreeHandler.getPaymentReturnBaseUrl(reqWithUntrustedHost), expectedProdBase);
    } finally {
      if (savedVercel) process.env.VERCEL = savedVercel; else delete process.env.VERCEL;
      if (savedNodeEnv) process.env.NODE_ENV = savedNodeEnv; else delete process.env.NODE_ENV;
    }
  });

  await test('getPaymentReturnBaseUrl strictly uses site.config.json in NODE_ENV=production, ignoring Host header', () => {
    const savedVercel = process.env.VERCEL;
    const savedNodeEnv = process.env.NODE_ENV;
    try {
      delete process.env.VERCEL;
      process.env.NODE_ENV = 'production';

      const reqWithLocalHost = { headers: { host: 'localhost:3000' } };
      assert.strictEqual(cashfreeHandler.getPaymentReturnBaseUrl(reqWithLocalHost), expectedProdBase);

      const reqWithUntrustedHost = { headers: { host: 'attacker.com' } };
      assert.strictEqual(cashfreeHandler.getPaymentReturnBaseUrl(reqWithUntrustedHost), expectedProdBase);
    } finally {
      if (savedVercel) process.env.VERCEL = savedVercel; else delete process.env.VERCEL;
      if (savedNodeEnv) process.env.NODE_ENV = savedNodeEnv; else delete process.env.NODE_ENV;
    }
  });

  await test('getPaymentReturnBaseUrl in local development constructs URL from verified loopback Host', () => {
    const savedVercel = process.env.VERCEL;
    const savedNodeEnv = process.env.NODE_ENV;
    try {
      delete process.env.VERCEL;
      process.env.NODE_ENV = 'development';

      assert.strictEqual(cashfreeHandler.getPaymentReturnBaseUrl({ headers: { host: 'localhost:3000' } }), 'http://localhost:3000');
      assert.strictEqual(cashfreeHandler.getPaymentReturnBaseUrl({ headers: { host: '127.0.0.1:8080' } }), 'http://127.0.0.1:8080');
      assert.strictEqual(cashfreeHandler.getPaymentReturnBaseUrl({ headers: { host: 'localhost' } }), 'http://localhost');
    } finally {
      if (savedVercel) process.env.VERCEL = savedVercel; else delete process.env.VERCEL;
      if (savedNodeEnv) process.env.NODE_ENV = savedNodeEnv; else delete process.env.NODE_ENV;
    }
  });

  await test('getPaymentReturnBaseUrl in local development respects configured LOCAL_APP_URL / LOCAL_DEV_ORIGIN', () => {
    const savedVercel = process.env.VERCEL;
    const savedNodeEnv = process.env.NODE_ENV;
    const savedLocalApp = process.env.LOCAL_APP_URL;
    try {
      delete process.env.VERCEL;
      process.env.NODE_ENV = 'development';
      process.env.LOCAL_APP_URL = 'http://localhost:5000/';

      assert.strictEqual(cashfreeHandler.getPaymentReturnBaseUrl({ headers: { host: 'localhost:3000' } }), 'http://localhost:5000');
    } finally {
      if (savedVercel) process.env.VERCEL = savedVercel; else delete process.env.VERCEL;
      if (savedNodeEnv) process.env.NODE_ENV = savedNodeEnv; else delete process.env.NODE_ENV;
      if (savedLocalApp) process.env.LOCAL_APP_URL = savedLocalApp; else delete process.env.LOCAL_APP_URL;
    }
  });

  await test('getPaymentReturnBaseUrl never trusts arbitrary/malicious Host headers and defaults safely', () => {
    const savedVercel = process.env.VERCEL;
    const savedNodeEnv = process.env.NODE_ENV;
    try {
      delete process.env.VERCEL;
      process.env.NODE_ENV = 'development';

      // Malicious or external host headers are rejected
      assert.strictEqual(cashfreeHandler.getPaymentReturnBaseUrl({ headers: { host: 'attacker.com' } }), 'http://localhost:3000');
      assert.strictEqual(cashfreeHandler.getPaymentReturnBaseUrl({ headers: { host: 'evil.org:3000' } }), 'http://localhost:3000');
      assert.strictEqual(cashfreeHandler.getPaymentReturnBaseUrl({ headers: { host: 'localhost.attacker.com' } }), 'http://localhost:3000');
      assert.strictEqual(cashfreeHandler.getPaymentReturnBaseUrl({}), 'http://localhost:3000');
    } finally {
      if (savedVercel) process.env.VERCEL = savedVercel; else delete process.env.VERCEL;
      if (savedNodeEnv) process.env.NODE_ENV = savedNodeEnv; else delete process.env.NODE_ENV;
    }
  });

  await test('create-order sends local return_url in local dev and production return_url in Vercel/prod', async () => {
    process.env.CASHFREE_APP_ID = 'test_app_id';
    process.env.CASHFREE_SECRET_KEY = 'test_secret_key';

    const returnTestStudent = await db.createStudent({
      email: `return_test_${Date.now()}@saturn.in`,
      password: 'Password123#',
      contactNumber: '9876543210',
      collegeName: 'Test College',
      academicYear: '1st Year',
      degree: 'B.E.'
    });
    const returnSession = await db.createSession(returnTestStudent.id, 'STUDENT');

    let capturedPayload = null;
    const origFetch = global.fetch;
    global.fetch = async (url, opts) => {
      capturedPayload = JSON.parse(opts.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          cf_order_id: 123456,
          order_id: capturedPayload.order_id,
          order_status: 'ACTIVE',
          payment_session_id: 'session_mock_return_test'
        })
      };
    };

    const savedVercel = process.env.VERCEL;
    const savedNodeEnv = process.env.NODE_ENV;
    try {
      // 1. Local dev mode
      delete process.env.VERCEL;
      process.env.NODE_ENV = 'development';
      const resLocal = await mockReqRes('POST', '/api/cashfree', { action: 'create-order' }, {
        authorization: `Bearer ${returnSession.token}`,
        host: 'localhost:3000'
      });
      assert.strictEqual(resLocal.status, 200);
      assert(capturedPayload, 'Fetch must be invoked');
      assert.strictEqual(capturedPayload.order_meta.return_url, 'http://localhost:3000/training/course-registration?order_id={order_id}');

      // 2. Production mode (mock session on both localDb and db-supabase)
      process.env.VERCEL = '1';
      capturedPayload = null;
      const dbSupabase = require('../src/db-supabase');
      const origSupabaseGetSession = dbSupabase.getSession;
      const origIsPaid = dbSupabase.isStudentPaid;
      const origCreateEnrollment = dbSupabase.createOrUpdateEnrollment;
      dbSupabase.getSession = async () => ({ student: returnTestStudent });
      dbSupabase.isStudentPaid = async () => false;
      dbSupabase.createOrUpdateEnrollment = async () => ({ id: 'enr_test' });

      const resProd = await mockReqRes('POST', '/api/cashfree', { action: 'create-order' }, {
        authorization: `Bearer ${returnSession.token}`,
        host: 'localhost:3000' // even with localhost header, Vercel enforces siteUrl
      });
      dbSupabase.getSession = origSupabaseGetSession;
      dbSupabase.isStudentPaid = origIsPaid;
      dbSupabase.createOrUpdateEnrollment = origCreateEnrollment;

      assert.strictEqual(resProd.status, 200);
      assert(capturedPayload, 'Fetch must be invoked');
      assert.strictEqual(capturedPayload.order_meta.return_url, `${expectedProdBase}/training/course-registration?order_id={order_id}`);
    } finally {
      global.fetch = origFetch;
      if (savedVercel) process.env.VERCEL = savedVercel; else delete process.env.VERCEL;
      if (savedNodeEnv) process.env.NODE_ENV = savedNodeEnv; else delete process.env.NODE_ENV;
    }
  });

  console.log('\n======================================================');
  console.log(`Results: ${passed} passed, ${failed} failed (Total: ${passed + failed})`);
  console.log('======================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runSecurityTests().catch((e) => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
