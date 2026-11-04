'use strict';
/**
 * Security Fixes & Database Cleanup Test Suite
 * Saturn Technologies - Training Module & Master Admin Panel
 */
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const db = require('../src/db');
const adminHandler = require('../api/admin');
const studentHandler = require('../api/student');

function mockRequest(handler, data = null, headers = {}, url = '/api') {
  const req = {
    method: 'POST',
    url,
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

    handler(req, res).catch((err) => {
      resolve({ status: 500, headers: {}, body: { error: err.message } });
    });
  });
}

async function runAuditFixTests() {
  console.log('===============================================================');
  console.log('   SATURN TECHNOLOGIES: SECURITY FIXES VERIFICATION SUITE      ');
  console.log('===============================================================\n');

  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`  [PASS] Test ${total}: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  [FAIL] Test ${total}: ${name}`);
      console.error(`         Error: ${err.message}`);
    }
  }

  async function asyncTest(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  [PASS] Test ${total}: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  [FAIL] Test ${total}: ${name}`);
      console.error(`         Error: ${err.message}`);
    }
  }

  // -------------------------------------------------------------
  // ISSUE 1: DEACTIVATED STUDENT LOGIN
  // -------------------------------------------------------------
  console.log('--- Issue 1: Deactivated Student Login Prevention ---');

  await asyncTest('Active student can authenticate normally via db', async () => {
    // We create temporary test student
    const testEmail = `sec_test_${Date.now()}@saturn.in`;
    const newStu = db.createStudent({
      email: testEmail,
      contactNumber: '9876543210',
      collegeName: 'Audit Testing College',
      academicYear: 'Final Year',
      degree: 'B.Tech IT',
      password: 'StrongStudentPass123!'
    });
    assert(newStu && newStu.id, 'Created temporary test student');

    // Authenticate active student
    const auth1 = db.authenticateStudent(testEmail, 'StrongStudentPass123!');
    assert(auth1 && auth1.id === newStu.id, 'Active student authentication returns student record');

    // Now deactivate student using toggleStudentStatus
    db.toggleStudentStatus(newStu.id, 'admin@saturn.in', false);

    // Attempt direct db authentication
    let thrownError = null;
    try {
      db.authenticateStudent(testEmail, 'StrongStudentPass123!');
    } catch (err) {
      thrownError = err;
    }
    assert(thrownError !== null, 'Deactivated student authentication must throw an error');
    assert.strictEqual(thrownError.code, 'ACCOUNT_DEACTIVATED', 'Error code must be ACCOUNT_DEACTIVATED');

    // Attempt HTTP login via /api/student
    const loginRes = await mockRequest(
      studentHandler,
      { action: 'login', email: testEmail, password: 'StrongStudentPass123!' },
      { 'x-forwarded-for': '10.0.0.99' },
      '/api/student'
    );
    assert.strictEqual(loginRes.status, 403, 'HTTP status must be 403 Forbidden');
    assert.strictEqual(loginRes.body.ok, false, 'Response ok must be false');
    assert.strictEqual(loginRes.body.code, 'ACCOUNT_DEACTIVATED', 'Response code must be ACCOUNT_DEACTIVATED');
    assert(!loginRes.headers['set-cookie'], 'Must not set session cookie for deactivated student');
    assert(!loginRes.body.token, 'Must not return session token for deactivated student');

    // Reactivate student
    db.toggleStudentStatus(newStu.id, 'admin@saturn.in', true);
    db.clearLoginRateLimit('10.0.0.99', testEmail);

    const reactivatedRes = await mockRequest(
      studentHandler,
      { action: 'login', email: testEmail, password: 'StrongStudentPass123!' },
      { 'x-forwarded-for': '10.0.0.99' },
      '/api/student'
    );
    assert.strictEqual(reactivatedRes.status, 200, 'Reactivated student logs in with HTTP 200');
    assert(reactivatedRes.body.token, 'Session token provided upon reactivation');
  });

  // -------------------------------------------------------------
  // ISSUE 2: FAILED PAYMENT DOUBLE-COUNTING
  // -------------------------------------------------------------
  console.log('\n--- Issue 2: Accurate Deduplicated Admin Stats ---');

  test('getAdminStats() deduplicates failed and pending payments by orderId', () => {
    const res = db.getAdminStats();
    assert(res && res.stats, 'Result must contain stats object');
    const stats = res.stats;

    // Read raw data files to verify order deduplication
    const payments = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'payments.json'), 'utf8'));
    const enrollments = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'enrollments.json'), 'utf8'));

    const failedPayments = payments.filter((p) => p.status === 'FAILED');
    const failedEnrollments = enrollments.filter((e) => e.status === 'PAYMENT_FAILED');
    
    // Build set of deduplicated order IDs
    const failedOrderIds = new Set();
    failedPayments.forEach((p) => { if (p.orderId) failedOrderIds.add(p.orderId); });
    failedEnrollments.forEach((e) => { if (e.cashfreeOrderId) failedOrderIds.add(e.cashfreeOrderId); });

    assert.strictEqual(
      stats.failedPayments,
      failedOrderIds.size,
      `stats.failedPayments (${stats.failedPayments}) must equal deduplicated count (${failedOrderIds.size})`
    );

    // Verify revenue calculation only includes verified successful payments
    const successfulPayments = payments.filter((p) => p.status === 'PAID' || p.status === 'SUCCESSFUL');
    const successfulOrderIds = new Set(successfulPayments.map((p) => p.orderId));
    assert.strictEqual(
      stats.paidStudents,
      successfulOrderIds.size,
      'stats.paidStudents must equal unique successful orders'
    );
    assert.strictEqual(
      stats.verifiedRevenue,
      successfulOrderIds.size * 5000,
      'stats.verifiedRevenue must be successful orders * 5000'
    );
  });

  // -------------------------------------------------------------
  // ISSUE 3: ADMIN SESSION INVALIDATION ON PASSWORD CHANGE
  // -------------------------------------------------------------
  console.log('\n--- Issue 3: Admin Session Invalidation on Password Change ---');

  await asyncTest('All admin sessions are revoked immediately when password is changed', async () => {
    const defaultPassword = 'SaturnAdmin2026!';
    const tempNewPassword = 'SaturnAdmin2026Changed!';

    // 1. Admin login to get a valid session
    const login1 = await mockRequest(
      adminHandler,
      { action: 'login', email: 'admin@saturn.in', password: defaultPassword },
      { 'x-forwarded-for': '127.0.0.1' },
      '/api/admin'
    );
    assert.strictEqual(login1.status, 200, 'Admin login with original password succeeds');
    const sessionToken1 = login1.body.token;
    assert(sessionToken1, 'Admin token received');

    // 2. Verify session is valid
    const verify1 = await mockRequest(
      adminHandler,
      { action: 'verify' },
      { authorization: `Bearer ${sessionToken1}` },
      '/api/admin'
    );
    assert.strictEqual(verify1.status, 200, 'Original session is valid');

    // 3. Change password
    const changeRes = await mockRequest(
      adminHandler,
      {
        action: 'change-password',
        currentPassword: defaultPassword,
        newPassword: tempNewPassword,
        confirmPassword: tempNewPassword
      },
      { authorization: `Bearer ${sessionToken1}` },
      '/api/admin'
    );
    assert.strictEqual(changeRes.status, 200, 'Password change request succeeds');

    // 4. Old session token must now be rejected with 401
    const verifyOldSession = await mockRequest(
      adminHandler,
      { action: 'verify' },
      { authorization: `Bearer ${sessionToken1}` },
      '/api/admin'
    );
    assert.strictEqual(
      verifyOldSession.status,
      401,
      'Old session token must be rejected with 401 Unauthorized after password change'
    );

    // 5. Login with new password
    const login2 = await mockRequest(
      adminHandler,
      { action: 'login', email: 'admin@saturn.in', password: tempNewPassword },
      { 'x-forwarded-for': '127.0.0.1' },
      '/api/admin'
    );
    assert.strictEqual(login2.status, 200, 'Admin can log in with new password');
    const sessionToken2 = login2.body.token;

    // 6. Restore original password
    const restoreRes = await mockRequest(
      adminHandler,
      {
        action: 'change-password',
        currentPassword: tempNewPassword,
        newPassword: defaultPassword,
        confirmPassword: defaultPassword
      },
      { authorization: `Bearer ${sessionToken2}` },
      '/api/admin'
    );
    assert.strictEqual(restoreRes.status, 200, 'Password restored to original SaturnAdmin2026!');

    // 7. Verify sessionToken2 is now also invalidated
    const verifySession2 = await mockRequest(
      adminHandler,
      { action: 'verify' },
      { authorization: `Bearer ${sessionToken2}` },
      '/api/admin'
    );
    assert.strictEqual(verifySession2.status, 401, 'Restoration also invalidated previous token');
  });

  // -------------------------------------------------------------
  // ISSUE 4: RATE LIMITING ON FAILED LOGINS
  // -------------------------------------------------------------
  console.log('\n--- Issue 4: Persistent Failed Login Rate Limiting ---');

  await asyncTest('Max 5 failed attempts per 15 min; 6th attempt returns 429 Too Many Requests', async () => {
    const testIp = '198.51.100.77';
    const testAccount = 'ratetest@saturn.in';

    // Clear any previous limits
    db.clearLoginRateLimit(testIp, testAccount);

    // 5 failed login attempts
    for (let i = 1; i <= 5; i++) {
      const res = await mockRequest(
        studentHandler,
        { action: 'login', email: testAccount, password: `WrongPass${i}!` },
        { 'x-forwarded-for': testIp },
        '/api/student'
      );
      assert.strictEqual(res.status, 401, `Attempt ${i} must return 401`);
    }

    // 6th attempt must trigger 429
    const blockedRes = await mockRequest(
      studentHandler,
      { action: 'login', email: testAccount, password: 'WrongPass6!' },
      { 'x-forwarded-for': testIp },
      '/api/student'
    );
    assert.strictEqual(blockedRes.status, 429, '6th attempt must return 429 Too Many Requests');
    assert.strictEqual(blockedRes.body.code, 'RATE_LIMITED', 'Error code must be RATE_LIMITED');
    assert(blockedRes.body.retryAfterMinutes >= 1, 'retryAfterMinutes must be >= 1');

    // Verify rate limit on admin endpoint as well
    const adminIp = '198.51.100.88';
    db.clearLoginRateLimit(adminIp, 'admin@saturn.in');
    for (let i = 1; i <= 5; i++) {
      const res = await mockRequest(
        adminHandler,
        { action: 'login', email: 'admin@saturn.in', password: `WrongAdminPass${i}!` },
        { 'x-forwarded-for': adminIp },
        '/api/admin'
      );
      assert.strictEqual(res.status, 401, `Admin attempt ${i} must return 401`);
    }
    const adminBlocked = await mockRequest(
      adminHandler,
      { action: 'login', email: 'admin@saturn.in', password: 'WrongAdminPass6!' },
      { 'x-forwarded-for': adminIp },
      '/api/admin'
    );
    assert.strictEqual(adminBlocked.status, 429, '6th admin attempt must return 429 Too Many Requests');
    assert.strictEqual(adminBlocked.body.code, 'RATE_LIMITED', 'Admin rate limit code must be RATE_LIMITED');

    // Clean up test rate limits
    db.clearLoginRateLimit(testIp, testAccount);
    db.clearLoginRateLimit(adminIp, 'admin@saturn.in');
  });

  // -------------------------------------------------------------
  // ISSUE 5: ORPHAN REFERRAL RECORD CLEANUP
  // -------------------------------------------------------------
  console.log('\n--- Issue 5: Orphan Referral Record Cleanup ---');

  test('Demo records rew_test_demo_001 and rew_test_demo_002 are removed and all 16 remain valid', () => {
    const rewardsFile = path.join(__dirname, '..', 'data', 'referral_rewards.json');
    const rawRewards = JSON.parse(fs.readFileSync(rewardsFile, 'utf8'));

    const demo1 = rawRewards.find((r) => r.id === 'rew_test_demo_001');
    const demo2 = rawRewards.find((r) => r.id === 'rew_test_demo_002');
    assert.strictEqual(demo1, undefined, 'rew_test_demo_001 must not exist');
    assert.strictEqual(demo2, undefined, 'rew_test_demo_002 must not exist');
    assert(rawRewards.length >= 16, 'At least 16 valid referral records must remain without orphans');

    // Verify every remaining record points to registered students
    const allStudents = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'students.json'), 'utf8'));
    const studentIdSet = new Set(allStudents.map((s) => s.id));

    rawRewards.forEach((r) => {
      assert(studentIdSet.has(r.referrerStudentId), `Referrer ${r.referrerStudentId} must be in students.json`);
      assert(studentIdSet.has(r.referredStudentId), `Referred ${r.referredStudentId} must be in students.json`);
    });

    // Verify backup existence
    const backupDir = path.join(__dirname, '..', 'data', 'backups');
    const snapshots = fs.readdirSync(backupDir);
    assert(snapshots.length > 0, 'Backup snapshot directory must exist');
    const latestSnapshot = path.join(backupDir, snapshots[snapshots.length - 1], 'referral_rewards.json');
    assert(fs.existsSync(latestSnapshot), 'Snapshot referral_rewards.json must exist in backup');
  });

  console.log('\n===============================================================');
  console.log(`RESULTS: ${passed}/${total} TESTS PASSED`);
  console.log('===============================================================');
  if (passed !== total) {
    process.exit(1);
  }
}

runAuditFixTests().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
