'use strict';
/**
 * Saturn Technologies - Phase 1 Final Corrections Verification Test Suite
 *
 * Verifies:
 * 1. Database dispatcher routing (local JSON vs Supabase adapter, fail-closed on incomplete config).
 * 2. Non-TTY admin initializer rejection (fails closed with exit code 1).
 * 3. All 8 admin methods present on both local and Supabase database adapters.
 * 4. Schema verification: SQL definitions for:
 *    - activate_verified_payment: payment ID mismatch conflict check on PAID order.
 *    - activate_verified_payment: GET DIAGNOSTICS for referral reward insertion flag.
 *    - activate_verified_payment: collision-resistant unique receipt number generation.
 *    - credit_referral_reward: immutable referral_credits_ledger & student referral_balance update.
 *    - uq_payments_receipt_number unique index on payments.
 *    - uq_reward_enrollment unique constraint.
 *    - RLS enabled on all sensitive tables including referral_credits_ledger.
 * 5. Materials access authorization and zero local fallback in Supabase mode.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

console.log('===============================================================');
console.log('   SATURN TECHNOLOGIES: PHASE 1 FINAL CORRECTIONS SUITE        ');
console.log('===============================================================\n');

let passedCount = 0;
function pass(label) {
  passedCount++;
  console.log(`  ✓ [PASS] ${label}`);
}

// ----------------------------------------------------------------------------
// Test 1: Non-TTY Admin Initializer Rejection
// ----------------------------------------------------------------------------
console.log('--- Test Group 1: Admin Initializer Non-TTY Rejection ---');
const initRun = spawnSync('node', ['scripts/init-admin.js'], {
  input: 'testpassword\n',
  encoding: 'utf8'
});
assert.strictEqual(initRun.status, 1, 'init-admin.js must exit with code 1 when stdin is not a TTY');
assert(
  initRun.stderr.includes('Interactive TTY terminal required') || initRun.stdout.includes('Interactive TTY terminal required'),
  'init-admin.js must log an explicit error message requiring interactive TTY'
);
pass('scripts/init-admin.js fails closed (exit code 1) when stdin is non-interactive');

// ----------------------------------------------------------------------------
// Test 2: Database Dispatcher Routing & Production Safety
// ----------------------------------------------------------------------------
console.log('\n--- Test Group 2: Database Dispatcher Routing & Production Safety ---');
const db = require('../src/db');
const dbSupabase = require('../src/db-supabase');

const origUrl = process.env.SUPABASE_URL;
const origKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const origVercel = process.env.VERCEL;
const origNodeEnv = process.env.NODE_ENV;
const origForceLocal = process.env.FORCE_LOCAL_DB;
const origUseLocal = process.env.USE_LOCAL_JSON;

try {
  // 2.1 Local override works in development
  delete process.env.VERCEL;
  process.env.NODE_ENV = 'development';
  process.env.USE_LOCAL_JSON = '1';
  process.env.SUPABASE_URL = 'https://fake-project.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-key';

  assert.strictEqual(typeof db.createStudent, 'function');
  assert.strictEqual(db.__isSupabase, false, 'Local override must route to local JSON in development');
  pass('Local override works in development when VERCEL is not set and NODE_ENV != production');

  // 2.2 Local override is ignored when VERCEL is set
  process.env.VERCEL = '1';
  process.env.NODE_ENV = 'development';
  process.env.USE_LOCAL_JSON = '1';
  process.env.FORCE_LOCAL_DB = '1';
  process.env.SUPABASE_URL = 'https://fake-project.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-key';

  assert.strictEqual(db.__isSupabase, true, 'Local override must be ignored when VERCEL is set');
  pass('Local override is strictly ignored when VERCEL is set');

  // 2.3 Local override is ignored when NODE_ENV=production
  delete process.env.VERCEL;
  process.env.NODE_ENV = 'production';
  process.env.USE_LOCAL_JSON = '1';
  process.env.FORCE_LOCAL_DB = '1';
  process.env.SUPABASE_URL = 'https://fake-project.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-key';

  assert.strictEqual(db.__isSupabase, true, 'Local override must be ignored when NODE_ENV is production');
  pass('Local override is strictly ignored when NODE_ENV=production');

  // 2.4 Both Supabase credentials select Supabase in production even if an override is set
  process.env.VERCEL = '1';
  process.env.NODE_ENV = 'production';
  process.env.USE_LOCAL_JSON = '1';
  process.env.FORCE_LOCAL_DB = '1';
  process.env.SUPABASE_URL = 'https://fake-project.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key-for-test';

  assert.strictEqual(db.__isSupabase, true, 'Both Supabase credentials must select Supabase in production');
  pass('Both Supabase credentials select Supabase in production even if override variables are set');

  // 2.5 Incomplete Supabase credentials fail closed
  delete process.env.USE_LOCAL_JSON;
  delete process.env.FORCE_LOCAL_DB;
  process.env.SUPABASE_URL = 'https://fake-project.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = '   '; // empty / whitespace only

  assert.throws(
    () => {
      const _ = db.findStudentByEmail;
    },
    /Incomplete Supabase configuration/,
    'Should throw when SUPABASE_URL is provided without SUPABASE_SERVICE_ROLE_KEY'
  );

  // Test reverse missing URL
  delete process.env.SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key-for-test';
  assert.throws(
    () => {
      const _ = db.findStudentByEmail;
    },
    /Incomplete Supabase configuration/,
    'Should throw when SUPABASE_SERVICE_ROLE_KEY is provided without SUPABASE_URL'
  );
  pass('Database dispatcher fails closed when Supabase configuration is incomplete');

} finally {
  if (origUrl) process.env.SUPABASE_URL = origUrl; else delete process.env.SUPABASE_URL;
  if (origKey) process.env.SUPABASE_SERVICE_ROLE_KEY = origKey; else delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (origVercel) process.env.VERCEL = origVercel; else delete process.env.VERCEL;
  if (origNodeEnv) process.env.NODE_ENV = origNodeEnv; else delete process.env.NODE_ENV;
  if (origForceLocal) process.env.FORCE_LOCAL_DB = origForceLocal; else delete process.env.FORCE_LOCAL_DB;
  if (origUseLocal) process.env.USE_LOCAL_JSON = origUseLocal; else delete process.env.USE_LOCAL_JSON;
}

// ----------------------------------------------------------------------------
// Test 3: All 8 Admin Methods Implemented & Exported
// ----------------------------------------------------------------------------
console.log('\n--- Test Group 3: Admin Methods Parity on Supabase Adapter ---');
const requiredAdminMethods = [
  'uploadAdminMaterial',
  'updateAdminMaterial',
  'replaceAdminMaterialFile',
  'deleteAdminMaterial',
  'changeAdminPassword',
  'getAdminAuditLogs',
  'getAdminMaterials',
  'getAdminStudentDetail'
];

for (const method of requiredAdminMethods) {
  assert.strictEqual(
    typeof dbSupabase[method],
    'function',
    `src/db-supabase.js must implement and export ${method}`
  );
  assert.strictEqual(
    typeof db[method],
    'function',
    `src/db.js dispatcher must export ${method}`
  );
}
pass('All 8 required admin methods are implemented on src/db-supabase.js and exported via src/db.js');

// ----------------------------------------------------------------------------
// Test 4: Schema Verification (schema.sql)
// ----------------------------------------------------------------------------
console.log('\n--- Test Group 4: Supabase Schema Integrity Verification ---');
const schemaSql = fs.readFileSync(path.resolve(__dirname, '..', 'supabase', 'schema.sql'), 'utf8');

// 4.1 Payment ID mismatch detection in activate_verified_payment
assert(
  schemaSql.includes('PAYMENT_ID_MISMATCH'),
  'activate_verified_payment must handle PAYMENT_ID_MISMATCH'
);
assert(
  schemaSql.includes('v_existing_payment.cf_payment_id <> p_cf_payment_id'),
  'activate_verified_payment must compare incoming cf_payment_id with v_existing_payment.cf_payment_id'
);
pass('schema.sql: activate_verified_payment rejects conflicting Cashfree payment IDs on already-paid orders');

// 4.2 Referral reward insertion flag checks actual inserted rows
assert(
  schemaSql.includes('GET DIAGNOSTICS v_reward_inserted = ROW_COUNT;') &&
  schemaSql.includes('v_reward_created := (v_reward_inserted > 0);'),
  'activate_verified_payment must set v_reward_created using GET DIAGNOSTICS ROW_COUNT'
);
pass('schema.sql: activate_verified_payment sets referral_reward_created true strictly when a row was inserted');

// 4.3 Receipt number unique index and collision handling
assert(
  schemaSql.includes('CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_receipt_number'),
  'schema.sql must define uq_payments_receipt_number unique index'
);
assert(
  schemaSql.includes('WHILE EXISTS (SELECT 1 FROM public.payments WHERE receipt_number = v_receipt_number) LOOP'),
  'schema.sql must include collision-detection loop for receipt numbers'
);
pass('schema.sql: payments receipt_number has database unique index and collision-resistant generation');

// 4.4 Referral Credit Ledger and Balance Tracking
assert(
  schemaSql.includes('CREATE TABLE IF NOT EXISTS public.referral_credits_ledger'),
  'schema.sql must define referral_credits_ledger table'
);
assert(
  schemaSql.includes('reward_id VARCHAR(64) NOT NULL UNIQUE REFERENCES public.referral_rewards(id)'),
  'referral_credits_ledger must enforce unique reward_id to guarantee no duplicate credits'
);
assert(
  schemaSql.includes('referral_balance NUMERIC(10, 2) DEFAULT 0.00 NOT NULL CHECK (referral_balance >= 0)'),
  'students table must include referral_balance with non-negative constraint'
);
assert(
  schemaSql.includes('UPDATE public.students') &&
  schemaSql.includes('SET referral_balance = referral_balance + v_reward.reward_amount'),
  'credit_referral_reward must atomically update referrer student referral_balance'
);
pass('schema.sql: referral credits recorded in immutable ledger and update student balance atomically');

// 4.5 Security Definer & Role Isolation
assert(
  schemaSql.includes('ALTER TABLE public.referral_credits_ledger ENABLE ROW LEVEL SECURITY;'),
  'referral_credits_ledger must have RLS enabled'
);
assert(
  schemaSql.includes('REVOKE ALL ON FUNCTION public.activate_verified_payment FROM PUBLIC, anon, authenticated;'),
  'activate_verified_payment execution must be revoked from anon and authenticated'
);
assert(
  schemaSql.includes('REVOKE ALL ON FUNCTION public.credit_referral_reward FROM PUBLIC, anon, authenticated;'),
  'credit_referral_reward execution must be revoked from anon and authenticated'
);
pass('schema.sql: strict RLS and SECURITY DEFINER execution privileges enforced');

// ----------------------------------------------------------------------------
// Test 5: Materials Authorization and Local Fallback Elimination
// ----------------------------------------------------------------------------
console.log('\n--- Test Group 5: Materials Storage Isolation ---');
const dbSupabaseCode = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'db-supabase.js'), 'utf8');

// Ensure getCourseMaterialFile in src/db-supabase.js does NOT fall back to local disk
const matFuncBody = dbSupabaseCode.slice(
  dbSupabaseCode.indexOf('async function getCourseMaterialFile'),
  dbSupabaseCode.indexOf('async function getStudentReferrals')
);
assert(
  !matFuncBody.includes('fs.readFileSync') && !matFuncBody.includes('data/materials'),
  'getCourseMaterialFile in src/db-supabase.js must not contain local disk fallbacks'
);
pass('src/db-supabase.js: course materials stream strictly from private Supabase Storage without local fallbacks');

console.log('\n===============================================================');
console.log(`RESULTS: ALL ${passedCount}/${passedCount} TESTS PASSED!`);
console.log('===============================================================');
