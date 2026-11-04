'use strict';
/**
 * Test script for Student Registration, Login, Course Registration & Cashfree Payment Integration
 * Runs both in-memory unit tests and file assertions.
 */
// Force local DB for isolated offline regression tests
process.env.USE_LOCAL_JSON = '1';
process.env.FORCE_LOCAL_DB = '1';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const db = require('../src/db');
const studentHandler = require('../api/student');
const cashfreeHandler = require('../api/cashfree');

function mockRequest(method, urlStr, data = null, headers = {}) {
  const handler = urlStr.startsWith('/api/cashfree') ? cashfreeHandler : studentHandler;
  const req = {
    method,
    url: urlStr,
    headers: {
      host: 'localhost',
      'content-type': 'application/json',
      ...headers
    },
    body: data
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
        this.ended = true;
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

    handler(req, res).catch((err) => {
      resolve({ status: 500, headers: {}, body: { error: err.message } });
    });
  });
}

async function runTests() {
  console.log('--- Starting Student Auth & Cashfree Course Payment Tests ---');
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

  // 1. Database unit test
  await test('DB: Hash password and verify correctly using crypto.scrypt', async () => {
    const plain = 'SecretPass123!';
    const hash = await db.hashPassword(plain);
    assert(hash.includes(':'), 'Hash must contain salt delimiter');
    assert(!hash.includes(plain), 'Hash must not contain plain text');
    assert(await db.verifyPassword(hash, plain), 'Verify password must match plain password');
    assert(!await db.verifyPassword(hash, 'WrongPassword'), 'Verify password must reject wrong password');
  });

  const testEmail = `student_${Date.now()}@saturn.in`;
  const testPhone = '9876543210';
  const testPassword = 'Password123#';

  // 2. Validation error testing
  await test('API: Validation error on missing / invalid fields', async () => {
    const res = await mockRequest('POST', '/api/student', {
      action: 'register',
      email: 'not-an-email',
      contactNumber: '123',
      collegeName: '',
      academicYear: '',
      degree: '',
      password: '123',
      confirmPassword: '456'
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.ok, false);
    assert(res.body.errors.email, 'Must flag invalid email');
    assert(res.body.errors.contactNumber, 'Must flag invalid contact number');
    assert(res.body.errors.collegeName, 'Must flag missing college name');
    assert(res.body.errors.academicYear, 'Must flag missing academic year');
    assert(res.body.errors.degree, 'Must flag missing degree');
    assert(res.body.errors.password, 'Must flag short password');
    assert(res.body.errors.confirmPassword, 'Must flag mismatched password');
  });

  // 3. Successful registration & unpaid status
  let studentSessionToken = '';
  await test('API: Successful student registration provides session and isPaid=false', async () => {
    const res = await mockRequest('POST', '/api/student', {
      action: 'register',
      email: testEmail,
      contactNumber: testPhone,
      collegeName: 'National Institute of Technology',
      academicYear: '3rd Year',
      degree: 'B.Tech Computer Science',
      password: testPassword,
      confirmPassword: testPassword
    });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.ok, true);
    assert.strictEqual(res.body.student.email, testEmail);
    assert.strictEqual(res.body.isPaid, false, 'New student must be unpaid initially');
    assert(res.body.token, 'Must return session token upon signup');

    studentSessionToken = res.body.token;

    // Verify stored student (Section 1: Unpaid students do not get active referral codes)
    const student = db.findStudentByEmail(testEmail);
    assert(student, 'Student record must exist in DB');
    assert.strictEqual(student.referralCode, null, 'Unpaid student must not receive an active referral code');
  });

  // 4. Duplicate email prevention
  await test('API: Reject duplicate email registration', async () => {
    const res = await mockRequest('POST', '/api/student', {
      action: 'register',
      email: testEmail,
      contactNumber: '9123456789',
      collegeName: 'Another College',
      academicYear: '2nd Year',
      degree: 'M.Tech',
      password: testPassword,
      confirmPassword: testPassword
    });
    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.body.ok, false);
  });

  // 5. Unpaid student login returns isPaid=false
  await test('API: Login returns isPaid=false for unpaid student', async () => {
    const res = await mockRequest('POST', '/api/student', {
      action: 'login',
      email: testEmail,
      password: testPassword
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.ok, true);
    assert.strictEqual(res.body.isPaid, false, 'Unpaid student must have isPaid=false');
  });

  // 6. Referral code validations
  await test('REFERRAL: Reject non-existent referral code', async () => {
    const res = await mockRequest('POST', '/api/student', {
      action: 'validate-referral',
      referralCode: 'FAKE-CODE-9999'
    }, { authorization: `Bearer ${studentSessionToken}` });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.valid, false);
  });

  // Create an eligible paid referrer student to test valid referral code
  const referrerEmail = `referrer_${Date.now()}@saturn.in`;
  const referrer = db.createStudent({
    email: referrerEmail,
    contactNumber: '9988776655',
    collegeName: 'IIT Madras',
    academicYear: 'Final Year',
    degree: 'B.Tech',
    password: 'Password123#'
  });
  const refOrderId = `order_ref_${Date.now()}`;
  db.createOrUpdateEnrollment({ studentId: referrer.id, orderId: refOrderId });
  db.markEnrollmentPaid({
    orderId: refOrderId,
    cfPaymentId: 'cf_ref_paid',
    paymentMethod: 'UPI'
  });

  const paidReferrer = db.findStudentById(referrer.id);
  assert(paidReferrer.referralCode, 'Paid referrer must receive active unique referral code upon payment');

  await test('REFERRAL: Prevent self-referral using own referral code', async () => {
    const { token: refToken } = db.createSession(paidReferrer.id);
    const res = await mockRequest('POST', '/api/student', {
      action: 'validate-referral',
      referralCode: paidReferrer.referralCode
    }, { authorization: `Bearer ${refToken}` });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.valid, false);
    assert(res.body.message.includes('own referral code'));
  });

  await test('REFERRAL: Accept valid referral code from eligible paid student', async () => {
    const res = await mockRequest('POST', '/api/student', {
      action: 'validate-referral',
      referralCode: paidReferrer.referralCode
    }, { authorization: `Bearer ${studentSessionToken}` });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.ok, true);
    assert.strictEqual(res.body.valid, true);
  });

  // 7. Cashfree Create Order API
  let createdOrderId = '';
  await test('CASHFREE API: Create order enforces server-side ₹5,000 fee and saves enrollment', async () => {
    // Unconfigured gateway returns 503
    delete process.env.CASHFREE_APP_ID;
    delete process.env.CASHFREE_SECRET_KEY;
    const unconfRes = await mockRequest('POST', '/api/cashfree', {
      action: 'create-order',
      referralCode: paidReferrer.referralCode
    }, { authorization: `Bearer ${studentSessionToken}` });
    assert.strictEqual(unconfRes.status, 503, 'Must return 503 when gateway is not configured');

    // Mock Cashfree API response with configured credentials
    process.env.CASHFREE_APP_ID = 'test_cf_app_id';
    process.env.CASHFREE_SECRET_KEY = 'test_cf_secret_key';
    const origFetch = global.fetch;
    global.fetch = async (url, opts) => ({
      ok: true,
      status: 200,
      json: async () => ({
        cf_order_id: 998877,
        order_id: JSON.parse(opts.body).order_id,
        order_status: 'ACTIVE',
        payment_session_id: 'session_test_' + Date.now()
      })
    });

    const res = await mockRequest('POST', '/api/cashfree', {
      action: 'create-order',
      referralCode: paidReferrer.referralCode,
      amount: 100 // Attacker attempts to change amount: backend must IGNORE and enforce 5,000!
    }, { authorization: `Bearer ${studentSessionToken}` });

    global.fetch = origFetch;

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.ok, true);
    assert.strictEqual(res.body.amount, 5000, 'Course fee must strictly be 5000 INR');
    assert.strictEqual(res.body.currency, 'INR');
    assert(res.body.orderId, 'Must generate unique order ID');
    assert(res.body.paymentSessionId, 'Must generate payment session ID');

    createdOrderId = res.body.orderId;

    // Check DB enrollment
    const enrollment = db.getEnrollmentByOrderId(createdOrderId);
    assert(enrollment, 'Enrollment must be saved in database');
    assert.strictEqual(enrollment.status, 'PENDING');
    assert.strictEqual(enrollment.amount, 5000);
    assert.strictEqual(enrollment.referralCodeUsed, paidReferrer.referralCode);
  });

  // 8. Payment Verification (Bypass rejection & verified webhook activation)
  await test('CASHFREE API: Verify order updates enrollment to PAID only via genuine server verification', async () => {
    // A. Assert simulate=success is rejected and does not activate enrollment
    await mockRequest('GET', `/api/cashfree?action=verify-order&order_id=${encodeURIComponent(createdOrderId)}&simulate=success`);
    const studentBefore = db.findStudentByEmail(testEmail);
    assert(!db.isStudentPaid(studentBefore.id), 'simulate=success MUST NOT mark student as PAID');

    // B. Activate via authentic signed Cashfree webhook
    const testSecret = 'test_cf_secret_key';
    process.env.CASHFREE_SECRET_KEY = testSecret;
    const nowTs = Date.now();
    const webhookPayload = {
      type: 'PAYMENT_SUCCESS_WEBHOOK',
      data: {
        order: {
          order_id: createdOrderId,
          order_amount: 5000,
          order_currency: 'INR'
        },
        payment: {
          cf_payment_id: 'cf_pay_' + Date.now(),
          payment_status: 'SUCCESS',
          payment_group: 'upi',
          payment_time: new Date().toISOString()
        }
      }
    };
    const rawBody = JSON.stringify(webhookPayload);
    const signature = crypto.createHmac('sha256', testSecret).update(String(nowTs) + rawBody).digest('base64');
    const webhookRes = await mockRequest('POST', '/api/cashfree?action=webhook', webhookPayload, {
      'x-webhook-signature': signature,
      'x-webhook-timestamp': String(nowTs)
    });
    assert.strictEqual(webhookRes.status, 200);
    assert.strictEqual(webhookRes.body.ok, true);

    // Verify student is now paid in database
    const student = db.findStudentByEmail(testEmail);
    assert(db.isStudentPaid(student.id), 'Student must now be marked PAID in database');

    // Verify student now received their active unique referral code
    const paidStudent = db.findStudentById(student.id);
    assert(paidStudent.referralCode, 'Paid student must now have an active unique referral code');

    // Verify payment transaction record exists in DB
    const payments = db.getStudentPayments(student.id);
    assert.strictEqual(payments.length, 1);
    assert.strictEqual(payments[0].amount, 5000);
    assert.strictEqual(payments[0].orderId, createdOrderId);
    assert.strictEqual(payments[0].status, 'PAID');
  });

  // 9. FEATURE 2: Referral Reward Creation & Initial Status
  let rewardRecordId = '';
  await test('REFERRAL REWARD: Verified payment creates ₹1,000 reward for referrer with status MONEY UNCREDITED', async () => {
    const rewards = db.getStudentReferrals(paidReferrer.id);
    assert.strictEqual(rewards.length, 1, 'Referrer must have exactly 1 reward record');

    const reward = rewards[0];
    assert.strictEqual(reward.rewardAmount, 1000, 'Referral reward must be exactly ₹1,000');
    assert.strictEqual(reward.status, db.REWARD_STATUS.UNCREDITED, 'Initial status must strictly be MONEY UNCREDITED');
    assert.strictEqual(reward.referralCode, paidReferrer.referralCode);
    assert.strictEqual(reward.orderId, createdOrderId);
    assert.strictEqual(reward.currency, 'INR');
    rewardRecordId = reward.id;

    // Check referrer summary calculation: MONEY UNCREDITED must NOT contribute to withdrawable balance!
    const summary = db.getStudentReferralSummary(paidReferrer.id);
    assert.strictEqual(summary.totalSuccessfulReferrals, 1);
    assert.strictEqual(summary.totalReferralRewards, 1000);
    assert.strictEqual(summary.withdrawableBalance, 0, 'MONEY UNCREDITED must NOT contribute to withdrawable balance');
    assert.strictEqual(summary.uncreditedRewards, 1000);
    assert.strictEqual(summary.history.length, 1);
    assert(summary.history[0].referredIdentifier.includes('***'), 'Referred student email must be masked for privacy');
    assert.strictEqual(summary.history[0].status, 'MONEY UNCREDITED');
  });

  // 10. FEATURE 2: Reward Idempotency (Prevent duplicate reward creation)
  await test('REFERRAL REWARD: Idempotency prevents duplicate referral reward creation for same enrollment', async () => {
    const enrollment = db.getEnrollmentByOrderId(createdOrderId);
    const duplicate = db.createReferralRewardForEnrollment(enrollment);
    assert.strictEqual(duplicate.id, rewardRecordId, 'Must return existing reward without creating a second record');

    const allRewards = db.getStudentReferrals(paidReferrer.id);
    assert.strictEqual(allRewards.length, 1, 'Duplicate rewards must not exist');
  });

  // 11. FEATURE 2: Status transition and withdrawable balance rules
  await test('REFERRAL BALANCE: REFERRAL CLAIM IN PROCESS does not contribute to withdrawable balance', async () => {
    db.updateReferralRewardStatus(rewardRecordId, db.REWARD_STATUS.IN_PROCESS, 'Claim in review');
    const summary = db.getStudentReferralSummary(paidReferrer.id);
    assert.strictEqual(summary.withdrawableBalance, 0, 'IN_PROCESS must NOT contribute to withdrawable balance');
    assert.strictEqual(summary.inProcessRewards, 1000);
  });

  await test('REFERRAL BALANCE: Only REFERRAL SUCCESSFULLY CREDITED contributes to withdrawable balance', async () => {
    db.updateReferralRewardStatus(rewardRecordId, db.REWARD_STATUS.CREDITED, 'Approved by admin');
    const summary = db.getStudentReferralSummary(paidReferrer.id);
    assert.strictEqual(summary.withdrawableBalance, 1000, 'Successfully credited reward MUST increase withdrawable balance');
    assert.strictEqual(summary.totalSuccessfulReferrals, 1);
    assert.strictEqual(summary.totalReferralRewards, 1000);
    assert.strictEqual(summary.history[0].status, 'REFERRAL SUCCESSFULLY CREDITED');
  });

  // 12. Payment verification idempotency
  await test('CASHFREE API: Idempotent payment verification does not duplicate records', async () => {
    const res = await mockRequest('GET', `/api/cashfree?action=verify-order&order_id=${encodeURIComponent(createdOrderId)}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, 'PAID');

    const student = db.findStudentByEmail(testEmail);
    const payments = db.getStudentPayments(student.id);
    assert.strictEqual(payments.length, 1, 'Duplicate payment records must not be created');
  });

  // 13. Duplicate course enrollment prevention
  await test('CASHFREE API: Prevent duplicate course enrollment when already paid', async () => {
    const res = await mockRequest('POST', '/api/cashfree', {
      action: 'create-order'
    }, { authorization: `Bearer ${studentSessionToken}` });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.code, 'ALREADY_PAID');
  });

  // 14. Paid student login returns isPaid=true and referral summary
  await test('API: Paid student login returns isPaid=true', async () => {
    const res = await mockRequest('POST', '/api/student', {
      action: 'login',
      email: testEmail,
      password: testPassword
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.isPaid, true, 'Paid student must have isPaid=true');
  });

  // 15. Session inspection returns enrollment, payments, and referral summary
  await test('API: GET /api/student returns paid enrollment, payments, and referral summary', async () => {
    const res = await mockRequest('GET', '/api/student', null, {
      authorization: `Bearer ${studentSessionToken}`
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.isPaid, true);
    assert(res.body.enrollment, 'Must include enrollment data');
    assert.strictEqual(res.body.enrollment.status, 'PAID');
    assert(Array.isArray(res.body.payments) && res.body.payments.length >= 1);
    assert(res.body.referral, 'Must include referral summary');
    assert(res.body.referral.referralCode, 'Paid student must have referral code in summary');
    assert.strictEqual(typeof res.body.referral.withdrawableBalance, 'number');
    assert(Array.isArray(res.body.referral.history));
  });

  // 16. My Payments & Printable Receipt tests
  await test('DB: getStudentPayments surfaces paid payments with receiptNumber and courseName', async () => {
    const student = db.findStudentByEmail(testEmail);
    assert(student, 'Test student must exist');
    const payments = db.getStudentPayments(student.id);
    assert(Array.isArray(payments) && payments.length >= 1);
    const paidPayment = payments.find((p) => p.status === 'PAID');
    assert(paidPayment, 'Must have a PAID payment record');
    assert.strictEqual(paidPayment.amount, 5000);
    assert.strictEqual(paidPayment.currency, 'INR');
    assert(paidPayment.receiptNumber, 'Paid payment must have receipt number');
    assert(paidPayment.receiptNumber.startsWith('SATURN-REC-'), 'Receipt number must follow SATURN-REC format');
    assert.strictEqual(paidPayment.courseName, 'Java Full Stack Training Programme');
  });

  await test('DB & API: getPaymentReceipt generates official receipt for verified paid transaction', async () => {
    const student = db.findStudentByEmail(testEmail);
    assert(student);
    const payments = db.getStudentPayments(student.id);
    const paidPayment = payments.find((p) => p.status === 'PAID');
    assert(paidPayment);

    // DB function
    const receipt = db.getPaymentReceipt({ studentId: student.id, paymentId: paidPayment.id });
    assert(receipt, 'Must return receipt object');
    assert.strictEqual(receipt.eligible, true);
    assert.strictEqual(receipt.company.legalName, 'Saturn Technologies India Private Limited');
    assert.strictEqual(receipt.status, 'PAID');
    assert.strictEqual(receipt.amount, 5000);
    assert.strictEqual(receipt.student.email, student.email);

    // API endpoint
    const res = await mockRequest('GET', `/api/student?action=receipt&payment_id=${paidPayment.id}`, null, {
      authorization: `Bearer ${studentSessionToken}`
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.ok, true);
    assert.strictEqual(res.body.receipt.receiptNumber, paidPayment.receiptNumber);
    assert.strictEqual(res.body.receipt.company.supportEmail, 'support@saturn.in');
  });

  await test('SECURITY: Receipt access denied for other students or non-existent payments', async () => {
    const student = db.findStudentByEmail(testEmail);
    // Another student tries to access student's receipt
    const otherStudent = db.createStudent({
      email: `intruder_${Date.now()}@saturn.in`,
      contactNumber: '9999900000',
      collegeName: 'Test College',
      academicYear: '4th Year',
      degree: 'B.Tech',
      password: 'Password123#'
    });
    const payments = db.getStudentPayments(student.id);
    const paidPayment = payments.find((p) => p.status === 'PAID');

    // DB level - other student cannot find or access another student's payment
    const intruderReceipt = db.getPaymentReceipt({ studentId: otherStudent.id, paymentId: paidPayment.id });
    assert.strictEqual(intruderReceipt, null, 'Intruder must not access another student receipt');

    // DB level - invalid payment id returns null
    const nonExistentReceipt = db.getPaymentReceipt({ studentId: student.id, paymentId: 'pay_nonexistent_9999' });
    assert.strictEqual(nonExistentReceipt, null, 'Nonexistent payment must return null');

    // API level - login as intruder and attempt to fetch student's receipt
    const intruderLogin = await mockRequest('POST', '/api/student', {
      action: 'login',
      email: otherStudent.email,
      password: 'Password123#'
    });
    const intruderToken = intruderLogin.body.token;
    const apiRes = await mockRequest('GET', `/api/student?action=receipt&payment_id=${paidPayment.id}`, null, {
      authorization: `Bearer ${intruderToken}`
    });
    assert.strictEqual(apiRes.status, 404, 'Must return 404 Not Found for unauthorized payment receipt');
    assert.strictEqual(apiRes.body.ok, false);
  });

  await test('SECURITY: Failed or pending payments do not generate paid receipts', async () => {
    const dummyStudent = db.createStudent({
      email: `unpaid_${Date.now()}@saturn.in`,
      contactNumber: '9888877777',
      collegeName: 'Test College',
      academicYear: '4th Year',
      degree: 'B.Tech',
      password: 'Password123#'
    });
    const dummyOrder = 'order_failed_test_' + Date.now();
    db.createOrUpdateEnrollment({
      studentId: dummyStudent.id,
      orderId: dummyOrder
    });
    db.markEnrollmentFailed({
      orderId: dummyOrder,
      reason: 'Transaction cancelled by user'
    });

    const failedPayments = db.getStudentPayments(dummyStudent.id);
    assert(failedPayments.length >= 1, 'Must have at least one failed payment record');
    const failedPay = failedPayments.find((p) => p.orderId === dummyOrder);
    assert(failedPay, 'Must find failed payment record');
    assert.strictEqual(failedPay.status, 'FAILED');
    assert.strictEqual(failedPay.receiptNumber, null, 'Failed payment must not have receiptNumber');

    // Attempting to generate receipt for failed payment must return eligible: false
    const failedReceipt = db.getPaymentReceipt({ studentId: dummyStudent.id, paymentId: failedPay.id });
    assert(failedReceipt);
    assert.strictEqual(failedReceipt.eligible, false);
    assert.strictEqual(failedReceipt.status, 'FAILED');

    // API check with dummy session
    const dummyLogin = await mockRequest('POST', '/api/student', {
      action: 'login',
      email: dummyStudent.email,
      password: 'Password123#'
    });
    const dummyToken = dummyLogin.body.token;
    const res = await mockRequest('GET', `/api/student?action=receipt&payment_id=${failedPay.id}`, null, {
      authorization: `Bearer ${dummyToken}`
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.ok, false);
    assert.strictEqual(res.body.status, 'FAILED');
  });

  // 17. Static page assertions on build output
  const root = path.join(__dirname, '..');
  const pub = path.join(root, 'public');

  await test('BUILD: /training/course-registration.html has single centered card and ₹5,000 fee', async () => {
    const html = fs.readFileSync(path.join(pub, 'training/course-registration.html'), 'utf8');
    assert(html.includes('id="course-reg-card"'), 'Must contain course registration card');
    assert(html.includes('course-reg-wrap'), 'Must contain centered wrap');
    assert(html.includes('₹5,000'), 'Must display ₹5,000 fee');
    assert(html.includes('id="course-ref-code"'), 'Must contain referral input');
    assert(html.includes('id="btn-course-register"'), 'Must contain register button');
    assert(html.includes('src="/assets/js/student.js"'), 'Must load student.js');
  });

  await test('BUILD: /training/dashboard.html has left sidebar with Referral Code, My Payments, and Materials', async () => {
    const html = fs.readFileSync(path.join(pub, 'training/dashboard.html'), 'utf8');
    assert(html.includes('id="btn-tab-referral"'), 'Must contain Referral Code button');
    assert(html.includes('id="btn-tab-payments"'), 'Must contain My Payments button');
    assert(html.includes('id="btn-tab-materials"'), 'Must contain Materials button');
    assert(html.includes('id="view-referral"'), 'Must contain referral view');
    assert(html.includes('id="view-payments"'), 'Must contain payments view');
    assert(html.includes('id="view-materials"'), 'Must contain materials view');
    assert(html.includes('id="payments-history-area"'), 'Must contain payments history container');
    assert(html.includes('id="dash-ref-code"'), 'Must contain referral code display element');
    assert(html.includes('id="btn-copy-ref"'), 'Must contain Copy button');
    assert(html.includes('id="btn-share-ref"'), 'Must contain Share button');
    assert(html.includes('id="btn-wa-share"'), 'Must contain WhatsApp Share button');
    assert(html.includes('id="stat-total-referrals"'), 'Must contain Total Referrals stat');
    assert(html.includes('id="stat-total-rewards"'), 'Must contain Total Rewards stat');
    assert(html.includes('id="stat-withdrawable-balance"'), 'Must contain Withdrawable Balance stat');
    assert(html.includes('id="ref-history-table"'), 'Must contain referral history table');
    assert(html.includes('id="receipt-modal-backdrop"'), 'Must contain receipt modal container');
    assert(html.includes('id="printable-receipt"'), 'Must contain printable receipt template');
    assert(html.includes('id="modal-btn-print"'), 'Must contain Print Receipt button');
    assert(html.includes('id="modal-btn-download"'), 'Must contain Download Receipt button');
  });

  // 18. Feature 3: Online PDF Materials & Embedded Viewer tests
  await test('MATERIALS: Authenticated paid student can list course materials via DB and API', async () => {
    const student = db.findStudentByEmail(testEmail);
    assert(student);

    // DB query
    const dbResult = db.getCourseMaterials({ studentId: student.id });
    assert.strictEqual(dbResult.ok, true);
    assert(Array.isArray(dbResult.materials) && dbResult.materials.length >= 5);
    const syllabus = dbResult.materials.find((m) => m.id === 'mat_syllabus_2026');
    assert(syllabus, 'Must include syllabus material');
    assert.strictEqual(syllabus.courseId, 'java-full-stack');
    assert(syllabus.title.includes('Syllabus'));
    assert(syllabus.pageCount > 0);

    // API endpoint GET /api/student?action=materials
    const apiRes = await mockRequest('GET', '/api/student?action=materials', null, {
      authorization: `Bearer ${studentSessionToken}`
    });
    assert.strictEqual(apiRes.status, 200);
    assert.strictEqual(apiRes.body.ok, true);
    assert(Array.isArray(apiRes.body.materials) && apiRes.body.materials.length >= 5);

    // Session inspection includes materials when paid
    const meRes = await mockRequest('GET', '/api/student', null, {
      authorization: `Bearer ${studentSessionToken}`
    });
    assert.strictEqual(meRes.status, 200);
    assert(Array.isArray(meRes.body.materials) && meRes.body.materials.length >= 5);
  });

  await test('MATERIALS: Authenticated paid student can fetch PDF buffer via DB and API', async () => {
    const student = db.findStudentByEmail(testEmail);
    assert(student);

    // DB function
    const fileResult = db.getCourseMaterialFile({ studentId: student.id, materialId: 'mat_syllabus_2026' });
    assert.strictEqual(fileResult.ok, true);
    assert.strictEqual(fileResult.contentType, 'application/pdf');
    assert(Buffer.isBuffer(fileResult.buffer));
    assert(fileResult.size > 0);
    assert(fileResult.buffer.toString('utf8', 0, 8).startsWith('%PDF-1.'));

    // API endpoint GET /api/student?action=material-file&id=mat_syllabus_2026
    const apiRes = await mockRequest('GET', '/api/student?action=material-file&id=mat_syllabus_2026', null, {
      authorization: `Bearer ${studentSessionToken}`
    });
    assert.strictEqual(apiRes.status, 200);
    assert.strictEqual(apiRes.headers['content-type'], 'application/pdf');
    assert(apiRes.headers['content-disposition'].includes('inline'));
    assert(String(apiRes.headers['cache-control']).includes('no-store'));
  });

  await test('SECURITY: Unpaid, pending, or unauthenticated requests are strictly rejected from materials and PDFs', async () => {
    // 1. Unauthenticated requests
    const unauthList = await mockRequest('GET', '/api/student?action=materials');
    assert.strictEqual(unauthList.status, 401);

    const unauthPdf = await mockRequest('GET', '/api/student?action=material-file&id=mat_syllabus_2026');
    assert.strictEqual(unauthPdf.status, 401);

    // 2. Unpaid student requests
    const unpaidStudent = db.createStudent({
      email: `unpaid_reader_${Date.now()}@saturn.in`,
      contactNumber: '9123456789',
      collegeName: 'Demo Institute',
      academicYear: '2nd Year',
      degree: 'B.Sc Computer Science',
      password: 'Password123#'
    });
    const unpaidLogin = await mockRequest('POST', '/api/student', {
      action: 'login',
      email: unpaidStudent.email,
      password: 'Password123#'
    });
    const unpaidToken = unpaidLogin.body.token;

    // Unpaid student listing materials
    const unpaidListRes = await mockRequest('GET', '/api/student?action=materials', null, {
      authorization: `Bearer ${unpaidToken}`
    });
    assert.strictEqual(unpaidListRes.status, 403);
    assert.strictEqual(unpaidListRes.body.ok, false);

    // Unpaid student requesting PDF file
    const unpaidPdfRes = await mockRequest('GET', '/api/student?action=material-file&id=mat_syllabus_2026', null, {
      authorization: `Bearer ${unpaidToken}`
    });
    assert.strictEqual(unpaidPdfRes.status, 403);
    assert.strictEqual(unpaidPdfRes.body.ok, false);

    // 3. Path traversal attempts
    const traversalRes = await mockRequest('GET', '/api/student?action=material-file&id=../../package.json', null, {
      authorization: `Bearer ${studentSessionToken}`
    });
    assert([400, 403, 404].includes(traversalRes.status));
  });

  await test('BUILD: /training/dashboard.html has Materials catalog, embedded PDF viewer, controls, and no download/print buttons', async () => {
    const html = fs.readFileSync(path.join(pub, 'training/dashboard.html'), 'utf8');

    // Materials section
    assert(html.includes('id="view-materials"'), 'Must contain materials view');
    assert(html.includes('id="materials-grid"'), 'Must contain materials grid container');

    // Embedded PDF viewer modal
    assert(html.includes('id="pdf-viewer-modal"'), 'Must contain PDF viewer modal container');
    assert(html.includes('id="pdf-doc-title"'), 'Must contain PDF document title');
    assert(html.includes('id="pdf-btn-back"'), 'Must contain back to materials button');
    assert(html.includes('id="pdf-btn-prev"'), 'Must contain previous page button');
    assert(html.includes('id="pdf-btn-next"'), 'Must contain next page button');
    assert(html.includes('id="pdf-page-num"'), 'Must contain current page indicator');
    assert(html.includes('id="pdf-page-count"'), 'Must contain total pages indicator');
    assert(html.includes('id="pdf-btn-zoom-in"'), 'Must contain zoom in button');
    assert(html.includes('id="pdf-btn-zoom-out"'), 'Must contain zoom out button');
    assert(html.includes('id="pdf-btn-zoom-fit"'), 'Must contain zoom fit button');
    assert(html.includes('id="pdf-canvas"'), 'Must contain HTML5 canvas for rendering PDF pages');
    assert(html.includes('id="pdf-watermark-overlay"'), 'Must contain watermark overlay');

    // Security check: Viewer MUST NOT contain any download or print buttons
    const viewerHtml = html.slice(html.indexOf('id="pdf-viewer-modal"'));
    const viewerSection = viewerHtml.slice(0, viewerHtml.indexOf('</section>'));
    assert(!viewerSection.includes('Download PDF'), 'Viewer must not have a Download PDF button');
    assert(!viewerSection.includes('Print Receipt'), 'Viewer must not have a Print Receipt button');
    assert(!viewerSection.includes('id="pdf-btn-download"'), 'Viewer must not have a download button id');
    assert(!viewerSection.includes('id="pdf-btn-print"'), 'Viewer must not have a print button id');

    // Bundled PDF.js library exists in public build
    assert(fs.existsSync(path.join(pub, 'assets/vendor/pdfjs/pdf.min.js')), 'PDF.js library must be present in build');
    assert(fs.existsSync(path.join(pub, 'assets/vendor/pdfjs/pdf.worker.min.js')), 'PDF.js worker must be present in build');
    assert(!fs.existsSync(path.join(pub, 'data')), 'PDF files must not be exposed statically in public/data');
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

runTests().catch((e) => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
