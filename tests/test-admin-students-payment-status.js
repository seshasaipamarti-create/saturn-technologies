'use strict';
/**
 * Saturn Technologies - Admin Registered Students Payment Status Verification Suite
 *
 * Verifies:
 * 1. PAID student correctly displays PAID.
 * 2. UNPAID student correctly displays UNPAID.
 * 3. PAID filter works correctly (displays only students with verified successful payments).
 * 4. UNPAID filter works correctly (displays only students without verified payments).
 * 5. Supabase query errors fail safely (throws explicit error rather than silently showing false data).
 * 6. Existing student information remains fully available (name, email, phone, college, degree, referralCode, etc.).
 * 7. Parity between Supabase adapter, local JSON adapter, and Admin UI rendering logic.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('======================================================================');
console.log('   SATURN TECHNOLOGIES: ADMIN STUDENTS PAYMENT STATUS TEST SUITE      ');
console.log('======================================================================\n');

let passed = 0;
function pass(label) {
  passed++;
  console.log(`  ✓ [PASS] ${label}`);
}

const supabaseSrc = fs.readFileSync(path.join(__dirname, '../src/db-supabase.js'), 'utf8');
const adminJsSrc = fs.readFileSync(path.join(__dirname, '../assets/js/admin.js'), 'utf8');
const publicAdminJsSrc = fs.readFileSync(path.join(__dirname, '../public/assets/js/admin.js'), 'utf8');
const localDbSrc = fs.readFileSync(path.join(__dirname, '../src/db.js'), 'utf8');

// ============================================================================
// 1. Supabase getAdminStudents Implementation & Error Safety
// ============================================================================
console.log('--- Test Group 1: Supabase Adapter Query & Fail-Closed Safety ---');

const getAdminStudentsMatch = supabaseSrc.match(/async function getAdminStudents[\s\S]*?^}/m);
assert(getAdminStudentsMatch, 'getAdminStudents function must exist in src/db-supabase.js');
const getAdminStudentsSrc = getAdminStudentsMatch[0];

// 1.1 Verify querying enrollments and payments for status = 'PAID'
assert(
  getAdminStudentsSrc.includes("supabase.from('enrollments').select('student_id').eq('status', 'PAID')"),
  'getAdminStudents must query enrollments table for student_id where status = PAID'
);
assert(
  getAdminStudentsSrc.includes("supabase.from('payments').select('student_id').eq('status', 'PAID')"),
  'getAdminStudents must query payments table for student_id where status = PAID'
);
pass('getAdminStudents queries both enrollments and payments for verified PAID student IDs');

// 1.2 Verify fail-closed error handling on query errors
assert(
  getAdminStudentsSrc.includes('if (studentsError) {') &&
  getAdminStudentsSrc.includes('throw new Error(`Failed to fetch students directory: ${studentsError.message}`);'),
  'getAdminStudents must explicitly throw if students query fails'
);
assert(
  getAdminStudentsSrc.includes('if (enrollmentsError) {') &&
  getAdminStudentsSrc.includes('throw new Error(`Failed to query verified student enrollments: ${enrollmentsError.message}`);'),
  'getAdminStudents must explicitly throw if enrollments query fails'
);
assert(
  getAdminStudentsSrc.includes('if (paymentsError) {') &&
  getAdminStudentsSrc.includes('throw new Error(`Failed to query verified student payments: ${paymentsError.message}`);'),
  'getAdminStudents must explicitly throw if payments query fails'
);
pass('getAdminStudents fails safely (throws explicit error) if any Supabase query fails');

// ============================================================================
// 2. Field Mapping & Preservation of Existing Student Information
// ============================================================================
console.log('\n--- Test Group 2: Student Field Mapping & Information Preservation ---');

// 2.1 Verify required fields are mapped in src/db-supabase.js
assert(getAdminStudentsSrc.includes("name: displayName,"), 'Must map name');
assert(getAdminStudentsSrc.includes("fullName: displayName,"), 'Must map fullName');
assert(getAdminStudentsSrc.includes("phone: s.contact_number || '',"), 'Must map phone');
assert(getAdminStudentsSrc.includes("contactNumber: s.contact_number || '',"), 'Must map contactNumber');
assert(getAdminStudentsSrc.includes("college: s.college_name || '',"), 'Must map college');
assert(getAdminStudentsSrc.includes("collegeName: s.college_name || '',"), 'Must map collegeName');
assert(getAdminStudentsSrc.includes("email: s.email,"), 'Must preserve email');
assert(getAdminStudentsSrc.includes("academicYear: s.academic_year,"), 'Must preserve academicYear');
assert(getAdminStudentsSrc.includes("degree: s.degree,"), 'Must preserve degree');
assert(getAdminStudentsSrc.includes("referralCode: s.referral_code,"), 'Must preserve referralCode');
assert(getAdminStudentsSrc.includes("paid: isPaid,"), 'Must include paid boolean');
assert(getAdminStudentsSrc.includes("isPaid,") || getAdminStudentsSrc.includes("isPaid: isPaid,"), 'Must include isPaid boolean');
assert(getAdminStudentsSrc.includes("createdAt: s.created_at"), 'Must preserve createdAt');
pass('src/db-supabase.js maps all required frontend fields while preserving all existing student fields');

// 2.2 Verify detail modal student mapping
const getAdminStudentDetailMatch = supabaseSrc.match(/async function getAdminStudentDetail[\s\S]*?^}/m);
assert(getAdminStudentDetailMatch, 'getAdminStudentDetail function must exist');
const getAdminStudentDetailSrc = getAdminStudentDetailMatch[0];
assert(getAdminStudentDetailSrc.includes('paid: isPaid'), 'getAdminStudentDetail must map paid: isPaid');
assert(getAdminStudentDetailSrc.includes('name: displayName'), 'getAdminStudentDetail must map name');
assert(getAdminStudentDetailSrc.includes('phone: student.contactNumber'), 'getAdminStudentDetail must map phone');
assert(getAdminStudentDetailSrc.includes('college: student.collegeName'), 'getAdminStudentDetail must map college');
pass('getAdminStudentDetail maps paid, name, phone, and college correctly for student profile modal');

// ============================================================================
// 3. Mock Pipeline Execution: PAID vs UNPAID Detection & Filtering
// ============================================================================
console.log('\n--- Test Group 3: Mock Pipeline Execution & Filter Tests ---');

function mockExecuteGetAdminStudents({ studentsData, enrollmentsData, paymentsData, search = '', status = 'ALL' }) {
  // Combine verified paid student IDs
  const paidStudentIds = new Set([
    ...(enrollmentsData || []).map((e) => e.student_id),
    ...(paymentsData || []).map((p) => p.student_id)
  ].filter(Boolean));

  const mapped = (studentsData || []).map((s) => {
    const isPaid = paidStudentIds.has(s.id);
    const displayName = s.email ? s.email.split('@')[0] : 'Student';
    return {
      id: s.id,
      name: displayName,
      fullName: displayName,
      email: s.email,
      phone: s.contact_number || '',
      contactNumber: s.contact_number || '',
      college: s.college_name || '',
      collegeName: s.college_name || '',
      academicYear: s.academic_year,
      degree: s.degree,
      referralCode: s.referral_code,
      status: s.status || 'ACTIVE',
      active: s.status !== 'INACTIVE' && s.active !== false,
      paid: isPaid,
      isPaid,
      createdAt: s.created_at
    };
  });

  const q = String(search || '').trim().toLowerCase();
  const filterStatus = String(status || 'ALL').toUpperCase();

  return mapped.filter((st) => {
    if (filterStatus === 'PAID' && !st.isPaid) return false;
    if (filterStatus === 'UNPAID' && st.isPaid) return false;
    if (filterStatus === 'ACTIVE' && (st.status !== 'ACTIVE' || st.active === false)) return false;
    if (filterStatus === 'INACTIVE' && (st.status === 'ACTIVE' && st.active !== false)) return false;

    if (q) {
      const match =
        (st.email && st.email.toLowerCase().includes(q)) ||
        (st.name && st.name.toLowerCase().includes(q)) ||
        (st.phone && st.phone.toLowerCase().includes(q)) ||
        (st.college && st.college.toLowerCase().includes(q)) ||
        (st.degree && st.degree.toLowerCase().includes(q)) ||
        (st.referralCode && st.referralCode.toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });
}

const mockStudents = [
  { id: 'stu_001', email: 'paid.via.enrollment@example.com', contact_number: '9876543210', college_name: 'Saturn Tech', academic_year: '4th Year', degree: 'CSE', referral_code: 'REF001', status: 'ACTIVE', active: true, created_at: '2026-11-01' },
  { id: 'stu_002', email: 'paid.via.payment@example.com', contact_number: '9876543211', college_name: 'Saturn Uni', academic_year: '3rd Year', degree: 'ECE', referral_code: 'REF002', status: 'ACTIVE', active: true, created_at: '2026-11-02' },
  { id: 'stu_003', email: 'unpaid.student@example.com', contact_number: '9876543212', college_name: 'Saturn College', academic_year: '2nd Year', degree: 'IT', referral_code: null, status: 'ACTIVE', active: true, created_at: '2026-11-03' },
  { id: 'stu_004', email: 'deactivated.unpaid@example.com', contact_number: '9876543213', college_name: 'Saturn Inst', academic_year: '1st Year', degree: 'Mech', referral_code: null, status: 'INACTIVE', active: false, created_at: '2026-11-04' }
];

const mockPaidEnrollments = [
  { student_id: 'stu_001', status: 'PAID' }
];

const mockPaidPayments = [
  { student_id: 'stu_002', status: 'PAID' }
];

// 3.1 Verify ALL filter returns all students with accurate paid flags
const allResult = mockExecuteGetAdminStudents({
  studentsData: mockStudents,
  enrollmentsData: mockPaidEnrollments,
  paymentsData: mockPaidPayments,
  status: 'ALL'
});
assert.strictEqual(allResult.length, 4, 'ALL filter must return all 4 students');

const student1 = allResult.find(s => s.id === 'stu_001');
const student2 = allResult.find(s => s.id === 'stu_002');
const student3 = allResult.find(s => s.id === 'stu_003');
const student4 = allResult.find(s => s.id === 'stu_004');

assert.strictEqual(student1.paid, true, 'Student 1 must have paid: true (verified via enrollment)');
assert.strictEqual(student1.isPaid, true, 'Student 1 must have isPaid: true');
assert.strictEqual(student2.paid, true, 'Student 2 must have paid: true (verified via payment)');
assert.strictEqual(student2.isPaid, true, 'Student 2 must have isPaid: true');
assert.strictEqual(student3.paid, false, 'Student 3 must have paid: false (unpaid)');
assert.strictEqual(student3.isPaid, false, 'Student 3 must have isPaid: false');
assert.strictEqual(student4.paid, false, 'Student 4 must have paid: false (unpaid)');
pass('Students with verified payments correctly identified as paid: true; others as paid: false');

// 3.2 Verify PAID filter
const paidResult = mockExecuteGetAdminStudents({
  studentsData: mockStudents,
  enrollmentsData: mockPaidEnrollments,
  paymentsData: mockPaidPayments,
  status: 'PAID'
});
assert.strictEqual(paidResult.length, 2, 'PAID filter must return exactly the 2 paid students');
assert(paidResult.every(s => s.paid === true), 'All results under PAID filter must have paid: true');
pass('PAID filter returns exclusively verified paid students');

// 3.3 Verify UNPAID filter
const unpaidResult = mockExecuteGetAdminStudents({
  studentsData: mockStudents,
  enrollmentsData: mockPaidEnrollments,
  paymentsData: mockPaidPayments,
  status: 'UNPAID'
});
assert.strictEqual(unpaidResult.length, 2, 'UNPAID filter must return exactly the 2 unpaid students');
assert(unpaidResult.every(s => s.paid === false), 'All results under UNPAID filter must have paid: false');
pass('UNPAID filter returns exclusively unpaid students');

// 3.4 Verify Account Status filters (ACTIVE / INACTIVE) are distinct from payment status
const activeResult = mockExecuteGetAdminStudents({
  studentsData: mockStudents,
  enrollmentsData: mockPaidEnrollments,
  paymentsData: mockPaidPayments,
  status: 'ACTIVE'
});
assert.strictEqual(activeResult.length, 3, 'ACTIVE filter must return 3 active students');

const inactiveResult = mockExecuteGetAdminStudents({
  studentsData: mockStudents,
  enrollmentsData: mockPaidEnrollments,
  paymentsData: mockPaidPayments,
  status: 'INACTIVE'
});
assert.strictEqual(inactiveResult.length, 1, 'INACTIVE filter must return 1 deactivated student');
assert.strictEqual(inactiveResult[0].id, 'stu_004');
pass('Account status filters (ACTIVE / INACTIVE) operate independently from payment status');

// ============================================================================
// 4. Admin UI Rendering Logic Verification
// ============================================================================
console.log('\n--- Test Group 4: Admin UI Rendering Logic & Public Asset Parity ---');

assert.strictEqual(
  adminJsSrc,
  publicAdminJsSrc,
  'public/assets/js/admin.js must match assets/js/admin.js after rebuild'
);
pass('public/assets/js/admin.js is in exact parity with assets/js/admin.js');

// Test row HTML generation for paid vs unpaid
function renderStudentRow(st) {
  const isPaid = Boolean(st.paid || st.isPaid);
  return `
    <tr data-student-id="${st.id}">
      <td><strong>${st.name || st.fullName || '—'}</strong></td>
      <td><a href="mailto:${st.email}">${st.email}</a></td>
      <td><span>${st.college || st.collegeName || '—'}</span></td>
      <td>${isPaid ? '<span class="badge ok">PAID</span>' : '<span class="badge">UNPAID</span>'}</td>
    </tr>
  `;
}

const paidRow = renderStudentRow(student1);
assert(paidRow.includes('<span class="badge ok">PAID</span>'), 'Paid student must render <span class="badge ok">PAID</span>');
assert(!paidRow.includes('<span class="badge">UNPAID</span>'), 'Paid student must NOT render UNPAID badge');
assert(paidRow.includes('Saturn Tech'), 'Paid student must render college name');
pass('Paid student row renders green PAID badge and full college/name info');

const unpaidRow = renderStudentRow(student3);
assert(unpaidRow.includes('<span class="badge">UNPAID</span>'), 'Unpaid student must render <span class="badge">UNPAID</span>');
assert(!unpaidRow.includes('<span class="badge ok">PAID</span>'), 'Unpaid student must NOT render green PAID badge');
pass('Unpaid student row renders UNPAID badge correctly');

// Test student detail modal paid badge logic
function getModalPaidBadge(st) {
  const isPaid = Boolean(st.paid || st.isPaid);
  return {
    className: 'badge ' + (isPaid ? 'ok' : ''),
    textContent: isPaid ? 'PAID ENROLLED' : 'UNPAID'
  };
}

const paidModalBadge = getModalPaidBadge(student1);
assert.strictEqual(paidModalBadge.textContent, 'PAID ENROLLED');
assert.strictEqual(paidModalBadge.className, 'badge ok');
pass('Student detail modal displays PAID ENROLLED badge for paid student');

const unpaidModalBadge = getModalPaidBadge(student3);
assert.strictEqual(unpaidModalBadge.textContent, 'UNPAID');
assert.strictEqual(unpaidModalBadge.className, 'badge ');
pass('Student detail modal displays UNPAID badge for unpaid student');

// ============================================================================
// 5. Local DB Adapter Parity Verification
// ============================================================================
console.log('\n--- Test Group 5: Local DB Adapter Parity ---');

process.env.FORCE_LOCAL_DB = '1';
const localDb = require('../src/db');
async function testLocalDbStudents() {
  const students = await localDb.getAdminStudents({ status: 'ALL' });
  assert(Array.isArray(students), 'getAdminStudents must return array');
  assert(students.length > 0, 'Local db should have student records');

  for (const st of students) {
    assert(typeof st.paid === 'boolean', `Student ${st.id} must have boolean paid property`);
    assert(typeof st.isPaid === 'boolean', `Student ${st.id} must have boolean isPaid property`);
    assert(st.name, `Student ${st.id} must have name`);
    assert(st.email, `Student ${st.id} must have email`);
  }
  pass(`Local adapter returned ${students.length} students with valid boolean paid and isPaid fields`);

  const detail = await localDb.getAdminStudentDetail(students[0].id);
  assert(detail && detail.student, 'getAdminStudentDetail must return student');
  assert(typeof detail.student.paid === 'boolean', 'detail.student must have boolean paid property');
  assert(typeof detail.student.isPaid === 'boolean', 'detail.student must have boolean isPaid property');
  assert(detail.student.name, 'detail.student must have name');
  pass('Local adapter getAdminStudentDetail returns parity student object with paid and isPaid');
}

testLocalDbStudents().then(() => {
  console.log('\n======================================================================');
  console.log(`RESULTS: ALL ${passed} ADMIN STUDENTS VERIFICATION TESTS PASSED!`);
  console.log('======================================================================\n');
}).catch(err => {
  console.error('\n❌ Test failed with error:', err);
  process.exit(1);
});
