'use strict';
/**
 * Saturn Technologies - Master Admin Panel Comprehensive Test Suite
 * Tests admin auth, permissions, dashboard metrics, student directory,
 * payment verification, referral reward progression, materials CRUD,
 * admin settings, and audit trail logging.
 */
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const db = require('../src/db');
const adminHandler = require('../api/admin');
const studentHandler = require('../api/student');

function mockAdminRequest(data = null, headers = {}) {
  const req = {
    method: 'POST',
    url: '/api/admin',
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

    adminHandler(req, res).catch((err) => {
      resolve({ status: 500, headers: {}, body: { error: err.message } });
    });
  });
}

async function runTests() {
  console.log('=== Saturn Technologies: Master Admin Panel Test Suite ===');
  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    try {
      await fn();
      passed++;
      console.log(`  ✓ [PASS] ${name}`);
    } catch (err) {
      console.error(`  ✗ [FAIL] ${name}: ${err.message}`);
      if (err.stack) console.error(err.stack);
    }
  }

  let adminToken = '';
  const DEFAULT_ADMIN_EMAIL = 'admin@saturn.in';
  const DEFAULT_ADMIN_PASS = 'SaturnAdmin2026!';

  // 1. Initial State & Setup
  await test('Admin account exists and is initialized in db', async () => {
    const master = db.getMasterAdmin();
    assert(master, 'Master admin must exist');
    assert.strictEqual(master.email, DEFAULT_ADMIN_EMAIL);
    assert(master.passwordHash, 'Admin password hash must be set');
    assert(master.passwordHash.includes(':'), 'Admin password hash must contain salt delimiter');
  });

  // 2. Authentication Security
  await test('Unauthenticated requests to admin endpoints are blocked (401)', async () => {
    const res = await mockAdminRequest({ action: 'stats' });
    assert.strictEqual(res.status, 401, 'Should return 401 without token');
    assert(res.body.message || res.body.error, 'Should contain error message');
  });

  await test('Requests with invalid/fake admin token are rejected (401)', async () => {
    const res = await mockAdminRequest({ action: 'stats' }, { authorization: 'Bearer invalid_fake_token_12345' });
    assert.strictEqual(res.status, 401, 'Should return 401 for invalid token');
  });

  await test('Admin login with incorrect password fails (401)', async () => {
    const res = await mockAdminRequest({
      action: 'login',
      email: DEFAULT_ADMIN_EMAIL,
      password: 'WrongPassword123!'
    });
    assert.strictEqual(res.status, 401, 'Should return 401 for wrong password');
  });

  await test('Admin login with non-existent email fails (401)', async () => {
    const res = await mockAdminRequest({
      action: 'login',
      email: 'hacker@saturn.in',
      password: DEFAULT_ADMIN_PASS
    });
    assert.strictEqual(res.status, 401, 'Should return 401 for unknown email');
  });

  await test('Master Admin successfully logs in with valid credentials and receives 24h token', async () => {
    const res = await mockAdminRequest({
      action: 'login',
      email: DEFAULT_ADMIN_EMAIL,
      password: DEFAULT_ADMIN_PASS
    });
    assert.strictEqual(res.status, 200, 'Should return 200 on login');
    assert(res.body.token, 'Should return session token');
    assert(res.body.admin, 'Should return admin profile');
    assert.strictEqual(res.body.admin.email, DEFAULT_ADMIN_EMAIL);
    adminToken = res.body.token;

    // Check Set-Cookie
    const cookie = res.headers['set-cookie'];
    assert(cookie, 'Set-Cookie header should be present');
    assert(cookie.includes('saturn_admin_token'), 'Cookie should include saturn_admin_token');
    assert(cookie.includes('HttpOnly'), 'Cookie must be HttpOnly');
  });

  await test('Verify action returns valid admin session profile', async () => {
    const res = await mockAdminRequest({ action: 'verify' }, { authorization: 'Bearer ' + adminToken });
    assert.strictEqual(res.status, 200);
    assert(res.body.admin);
    assert.strictEqual(res.body.admin.email, DEFAULT_ADMIN_EMAIL);
    assert(/admin/i.test(res.body.admin.role), 'Role must indicate admin authorization');
  });

  // 3. Admin Dashboard Metrics
  await test('Stats action returns all 8 required dashboard summary metrics', async () => {
    const res = await mockAdminRequest({ action: 'stats' }, { authorization: 'Bearer ' + adminToken });
    assert.strictEqual(res.status, 200);
    const s = res.body.stats;
    assert(typeof s.totalStudents === 'number', 'totalStudents must be number');
    assert(typeof s.paidStudents === 'number', 'paidStudents must be number');
    assert(typeof s.pendingPayments === 'number', 'pendingPayments must be number');
    assert(typeof s.failedPayments === 'number', 'failedPayments must be number');
    assert(typeof s.totalRevenue === 'number', 'totalRevenue must be number');
    assert(typeof s.totalReferrals === 'number', 'totalReferrals must be number');
    assert(typeof s.uncreditedRewards === 'number', 'uncreditedRewards must be number');
    assert(typeof s.creditedRewards === 'number', 'creditedRewards must be number');

    assert(Array.isArray(s.recentStudents), 'recentStudents must be array');
    assert(Array.isArray(s.recentPayments), 'recentPayments must be array');
    assert(Array.isArray(s.recentReferrals), 'recentReferrals must be array');

    // Revenue calculation check (paidStudents * 5000)
    assert.strictEqual(s.totalRevenue, s.paidStudents * 5000, 'Total revenue should equal paidStudents * 5000');
  });

  // 4. Students Directory
  let testStudentId = null;
  await test('Students action lists all registered students with full details', async () => {
    const res = await mockAdminRequest({ action: 'students' }, { authorization: 'Bearer ' + adminToken });
    assert.strictEqual(res.status, 200);
    assert(Array.isArray(res.body.students));
    assert(res.body.students.length > 0, 'Should have at least 1 student');

    const first = res.body.students[0];
    testStudentId = first.id;
    assert(first.name, 'Student must have name');
    assert(first.email, 'Student must have email');
    assert(typeof first.paid === 'boolean', 'Student must have paid boolean');
  });

  await test('Student-detail action returns profile, all payment attempts, and referrals', async () => {
    assert(testStudentId, 'testStudentId must be set');
    const res = await mockAdminRequest({
      action: 'student-detail',
      studentId: testStudentId
    }, { authorization: 'Bearer ' + adminToken });

    assert.strictEqual(res.status, 200);
    assert(res.body.student);
    assert.strictEqual(res.body.student.id, testStudentId);
    assert(Array.isArray(res.body.payments), 'Payments must be array');
    assert(Array.isArray(res.body.referrals), 'Referrals must be array');
  });

  await test('Toggle-student-status can deactivate and reactivate student access', async () => {
    assert(testStudentId, 'testStudentId must be set');
    // Deactivate
    const resDeact = await mockAdminRequest({
      action: 'toggle-student-status',
      studentId: testStudentId,
      active: false
    }, { authorization: 'Bearer ' + adminToken });
    assert.strictEqual(resDeact.status, 200);
    assert.strictEqual(resDeact.body.active, false);

    // Verify in db
    const stDeact = db.findStudentById(testStudentId);
    assert.strictEqual(stDeact.active, false);

    // Reactivate
    const resAct = await mockAdminRequest({
      action: 'toggle-student-status',
      studentId: testStudentId,
      active: true
    }, { authorization: 'Bearer ' + adminToken });
    assert.strictEqual(resAct.status, 200);
    assert.strictEqual(resAct.body.active, true);

    const stAct = db.findStudentById(testStudentId);
    assert.strictEqual(stAct.active, true);
  });

  // 5. Payment Management & Receipts
  let testPaidPaymentId = null;
  await test('Payments action lists all payment transactions and attempts', async () => {
    const res = await mockAdminRequest({ action: 'payments' }, { authorization: 'Bearer ' + adminToken });
    assert.strictEqual(res.status, 200);
    assert(Array.isArray(res.body.payments));

    const paidPayment = res.body.payments.find(p => p.status === 'SUCCESSFUL');
    if (paidPayment) testPaidPaymentId = paidPayment.id;
  });

  await test('Receipt action returns verified official receipt matching company details', async () => {
    if (!testPaidPaymentId) {
      console.log('    (Skipping receipt check: no paid payment in db yet)');
      return;
    }

    const res = await mockAdminRequest({
      action: 'receipt',
      paymentId: testPaidPaymentId
    }, { authorization: 'Bearer ' + adminToken });

    assert.strictEqual(res.status, 200);
    const rec = res.body.receipt;
    assert(rec, 'Receipt object must exist');
    assert(rec.receiptNumber, 'Receipt number must exist');
    assert.strictEqual(rec.paymentStatus, 'SUCCESSFUL');
    assert.strictEqual(rec.amount, 5000);
    assert(rec.studentEmail, 'Student email must be on receipt');
  });

  // 6. Referral Management & Progression Workflow
  let testReferralId = null;
  await test('Referrals action lists all referral records and rewards', async () => {
    const res = await mockAdminRequest({ action: 'referrals' }, { authorization: 'Bearer ' + adminToken });
    assert.strictEqual(res.status, 200);
    assert(Array.isArray(res.body.referrals));

    if (res.body.referrals.length > 0) {
      testReferralId = res.body.referrals[0].id;
    }
  });

  await test('Update-reward-status advances status through official workflow', async () => {
    // If no referral exists, let's create a temporary referral relationship to test
    const students = db.getAdminStudents();
    const referrer = students.find(s => s.paid && s.referralCode);
    const referred = students.find(s => s.id !== (referrer && referrer.id));

    let refId = testReferralId;
    if (!refId && referrer && referred) {
      const created = db.recordReferralUsage(referrer.id, referrer.referralCode, referred.id);
      refId = created.id;
    }

    if (!refId) {
      console.log('    (No referral available to test progression)');
      return;
    }

    // Progression 1: REFERRAL CLAIM IN PROCESS
    const res1 = await mockAdminRequest({
      action: 'update-reward-status',
      referralId: refId,
      status: 'REFERRAL CLAIM IN PROCESS',
      notes: 'Reviewed by admin test'
    }, { authorization: 'Bearer ' + adminToken });
    assert.strictEqual(res1.status, 200);
    assert.strictEqual(res1.body.referral.rewardStatus, 'REFERRAL CLAIM IN PROCESS');

    // Progression 2: REFERRAL SUCCESSFULLY CREDITED
    const res2 = await mockAdminRequest({
      action: 'update-reward-status',
      referralId: refId,
      status: 'REFERRAL SUCCESSFULLY CREDITED',
      notes: 'Approved and credited by admin test'
    }, { authorization: 'Bearer ' + adminToken });
    assert.strictEqual(res2.status, 200);
    assert.strictEqual(res2.body.referral.rewardStatus, 'REFERRAL SUCCESSFULLY CREDITED');

    // Verify referrer balance increased if referred student is paid
    const updatedRef = res2.body.referral;
    const refOwner = db.findStudentById(updatedRef.referrerStudentId);
    assert(refOwner, 'Referrer must exist');
    const refStats = db.getStudentReferralSummary(refOwner.id);
    assert(typeof refStats.withdrawableBalance === 'number', 'Withdrawable referral balance must be a number');
    assert(refStats.withdrawableBalance >= 1000, 'Withdrawable balance must include the credited ₹1,000');
  });

  // 7. Course Materials Management (CRUD)
  let testUploadedMatId = null;
  const samplePdfBase64 = Buffer.from(
    '%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n2 0 obj\n<<\n/Type /Pages\n/Kids [3 0 R]\n/Count 1\n>>\nendobj\n3 0 obj\n<<\n/Type /Page\n/Parent 2 0 R\n/MediaBox [0 0 612 792]\n/Resources <<>>\n>>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n0000000117 00000 n \ntrailer\n<<\n/Size 4\n/Root 1 0 R\n>>\nstartxref\n205\n%%EOF\n'
  ).toString('base64');

  await test('Materials list returns course PDF documents', async () => {
    const res = await mockAdminRequest({ action: 'materials' }, { authorization: 'Bearer ' + adminToken });
    assert.strictEqual(res.status, 200);
    assert(Array.isArray(res.body.materials));
    assert(res.body.materials.length > 0, 'Default course materials should exist');
  });

  await test('Reject upload of non-PDF or spoofed files', async () => {
    const fakeBase64 = Buffer.from('NOT A PDF FILE TEXT CONTENT').toString('base64');
    const res = await mockAdminRequest({
      action: 'upload-material',
      title: 'Malicious File',
      category: 'Test',
      filename: 'fake.pdf',
      fileData: fakeBase64
    }, { authorization: 'Bearer ' + adminToken });

    assert.strictEqual(res.status, 400, 'Should reject non-PDF with 400');
    assert((res.body.message || res.body.error).includes('genuine PDF'));
  });

  await test('Upload valid course PDF document successfully', async () => {
    const res = await mockAdminRequest({
      action: 'upload-material',
      title: 'Test Admin Uploaded Guide',
      category: 'Unit Testing',
      description: 'Automated test document',
      filename: 'test-admin-guide.pdf',
      fileData: samplePdfBase64
    }, { authorization: 'Bearer ' + adminToken });

    assert.strictEqual(res.status, 200);
    assert(res.body.material);
    testUploadedMatId = res.body.material.id;
    assert.strictEqual(res.body.material.title, 'Test Admin Uploaded Guide');
  });

  await test('Update material metadata (title, category, order)', async () => {
    assert(testUploadedMatId, 'testUploadedMatId must be set');
    const res = await mockAdminRequest({
      action: 'update-material',
      materialId: testUploadedMatId,
      title: 'Updated Test Guide Title',
      category: 'Advanced Testing',
      order: 99
    }, { authorization: 'Bearer ' + adminToken });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.material.title, 'Updated Test Guide Title');
    assert.strictEqual(res.body.material.category, 'Advanced Testing');
    assert.strictEqual(res.body.material.order, 99);
  });

  await test('Replace material PDF file with new PDF content', async () => {
    assert(testUploadedMatId, 'testUploadedMatId must be set');
    const res = await mockAdminRequest({
      action: 'replace-material',
      materialId: testUploadedMatId,
      filename: 'replaced-guide.pdf',
      fileData: samplePdfBase64
    }, { authorization: 'Bearer ' + adminToken });

    assert.strictEqual(res.status, 200);
    assert(res.body.material);
    assert.strictEqual(res.body.material.id, testUploadedMatId);
  });

  await test('Delete uploaded test material cleanly', async () => {
    assert(testUploadedMatId, 'testUploadedMatId must be set');
    const res = await mockAdminRequest({
      action: 'delete-material',
      materialId: testUploadedMatId
    }, { authorization: 'Bearer ' + adminToken });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);

    // Verify deletion
    const mats = db.getAdminMaterials();
    assert(!mats.some(m => m.id === testUploadedMatId), 'Material should no longer exist');
  });

  // 8. Admin Settings, Password Change & Audit Trail
  await test('Change admin password validation & execution', async () => {
    // 1. Wrong current password fails
    const failRes = await mockAdminRequest({
      action: 'change-password',
      currentPassword: 'IncorrectPassword!',
      newPassword: 'NewSecurePassword2026!'
    }, { authorization: 'Bearer ' + adminToken });
    assert.strictEqual(failRes.status, 401);

    // 2. Too short new password fails
    const shortRes = await mockAdminRequest({
      action: 'change-password',
      currentPassword: DEFAULT_ADMIN_PASS,
      newPassword: 'short'
    }, { authorization: 'Bearer ' + adminToken });
    assert.strictEqual(shortRes.status, 400);

    // 3. Valid change succeeds
    const tempPass = 'TemporaryAdmin2026!';
    const succRes = await mockAdminRequest({
      action: 'change-password',
      currentPassword: DEFAULT_ADMIN_PASS,
      newPassword: tempPass
    }, { authorization: 'Bearer ' + adminToken });
    assert.strictEqual(succRes.status, 200);
    assert.strictEqual(succRes.body.success, true);

    // 4. Verify login works with new password
    const newLoginRes = await mockAdminRequest({
      action: 'login',
      email: DEFAULT_ADMIN_EMAIL,
      password: tempPass
    });
    assert.strictEqual(newLoginRes.status, 200);
    const newAdminToken = newLoginRes.body.token;

    // 5. Revert back to DEFAULT_ADMIN_PASS for idempotency
    const revertRes = await mockAdminRequest({
      action: 'change-password',
      currentPassword: tempPass,
      newPassword: DEFAULT_ADMIN_PASS
    }, { authorization: 'Bearer ' + newAdminToken });
    assert.strictEqual(revertRes.status, 200);

    // 6. Refresh adminToken since password change invalidates all previous sessions
    const reLogin = await mockAdminRequest({
      action: 'login',
      email: DEFAULT_ADMIN_EMAIL,
      password: DEFAULT_ADMIN_PASS
    });
    assert.strictEqual(reLogin.status, 200);
    adminToken = reLogin.body.token;
  });

  await test('Audit logs record admin actions chronologically', async () => {
    const res = await mockAdminRequest({ action: 'audit-logs' }, { authorization: 'Bearer ' + adminToken });
    assert.strictEqual(res.status, 200);
    assert(Array.isArray(res.body.logs));
    assert(res.body.logs.length > 0, 'Audit logs should contain recorded actions');

    const actions = res.body.logs.map(l => l.action);
    assert(actions.includes('ADMIN_LOGIN') || actions.includes('ADMIN_PASSWORD_CHANGED'));
  });

  await test('Logout action invalidates session token', async () => {
    const res = await mockAdminRequest({ action: 'logout' }, { authorization: 'Bearer ' + adminToken });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);

    // Verify token is now rejected
    const checkRes = await mockAdminRequest({ action: 'verify' }, { authorization: 'Bearer ' + adminToken });
    assert.strictEqual(checkRes.status, 401, 'Invalidated token should return 401');
  });

  console.log(`\n========================================`);
  console.log(`RESULTS: ${passed}/${total} Admin Tests Passed.`);
  console.log(`========================================`);

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
