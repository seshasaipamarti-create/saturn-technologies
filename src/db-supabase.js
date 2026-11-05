'use strict';
/**
 * Saturn Technologies - Supabase PostgreSQL Database Adapter
 *
 * Implements the database interface using @supabase/supabase-js with
 * SUPABASE_SERVICE_ROLE_KEY (server-side only, bypasses RLS).
 * Zero credentials in client-side code.
 */
const crypto = require('crypto');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Auto-load .env or .env.local if present
try {
  const fs = require('fs');
  for (const p of ['.env', '.env.local']) {
    const full = path.resolve(__dirname, '..', p);
    if (fs.existsSync(full)) {
      const lines = fs.readFileSync(full, 'utf8').split('\n');
      for (const l of lines) {
        const t = l.trim();
        if (!t || t.startsWith('#')) continue;
        const idx = t.indexOf('=');
        if (idx > 0) {
          const k = t.slice(0, idx).trim();
          let v = t.slice(idx + 1).trim();
          if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
            v = v.slice(1, -1);
          }
          if (!process.env[k]) process.env[k] = v;
        }
      }
    }
  }
} catch (_) {}

const COURSE_ID = 'java-full-stack';
const COURSE_NAME = 'Java Full Stack Training Programme';
const COURSE_FEE = 5000;
const COURSE_CURRENCY = 'INR';

const REFERRAL_REWARD_AMOUNT = 1000;
const REWARD_STATUS = Object.freeze({
  UNCREDITED: 'MONEY UNCREDITED',
  IN_PROCESS: 'REFERRAL CLAIM IN PROCESS',
  CREDITED: 'REFERRAL SUCCESSFULLY CREDITED'
});

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX_ATTEMPTS = 5;

let supabaseInstance = null;

function getClient() {
  if (supabaseInstance) return supabaseInstance;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase configuration missing: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
  }
  supabaseInstance = createClient(url, key, {
    auth: { persistSession: false }
  });
  return supabaseInstance;
}

function isConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// Password Hashing (scrypt: 16-byte random salt, 64-byte key)
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `${salt.toString('hex')}$${derivedKey.toString('hex')}`;
}

function verifyPassword(storedHash, password) {
  if (!storedHash || !password) return false;
  const [saltHex, keyHex] = storedHash.split('$');
  if (!saltHex || !keyHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  const keyBuffer = Buffer.from(keyHex, 'hex');
  return crypto.timingSafeEqual(derivedKey, keyBuffer);
}

function generateReceiptNumber(orderId, paymentId) {
  const seed = String(orderId || paymentId || '').replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase();
  return `SATURN-REC-2026-${seed || '0001'}`;
}

// ----------------------------------------------------
// 1. STUDENTS & SESSIONS
// ----------------------------------------------------

async function createStudent({ email, contactNumber, collegeName, academicYear, degree, password }) {
  const supabase = getClient();
  const normalizedEmail = String(email || '').trim().toLowerCase();

  // Check duplicate email
  const { data: existing } = await supabase
    .from('students')
    .select('id')
    .eq('email', normalizedEmail)
    .single();

  if (existing) {
    const err = new Error('This email address is already registered.');
    err.code = 'EMAIL_EXISTS';
    throw err;
  }

  const student = {
    id: 'stu_' + crypto.randomBytes(8).toString('hex'),
    email: normalizedEmail,
    contact_number: String(contactNumber).trim(),
    college_name: String(collegeName).trim(),
    academic_year: String(academicYear).trim(),
    degree: String(degree).trim(),
    referral_code: null,
    password_hash: hashPassword(password),
    status: 'ACTIVE',
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase.from('students').insert(student);
  if (error) {
    if (error.code === '23505') {
      const err = new Error('This email address is already registered.');
      err.code = 'EMAIL_EXISTS';
      throw err;
    }
    throw error;
  }

  return {
    id: student.id,
    email: student.email,
    contactNumber: student.contact_number,
    collegeName: student.college_name,
    academicYear: student.academic_year,
    degree: student.degree,
    referralCode: student.referral_code,
    status: student.status,
    active: student.active,
    createdAt: student.created_at
  };
}

async function findStudentByEmail(email) {
  const supabase = getClient();
  const { data } = await supabase
    .from('students')
    .select('*')
    .eq('email', String(email || '').trim().toLowerCase())
    .maybeSingle();

  if (!data) return null;
  return {
    id: data.id,
    email: data.email,
    contactNumber: data.contact_number,
    collegeName: data.college_name,
    academicYear: data.academic_year,
    degree: data.degree,
    referralCode: data.referral_code,
    passwordHash: data.password_hash,
    status: data.status,
    active: data.active,
    createdAt: data.created_at
  };
}

async function findStudentById(id) {
  const supabase = getClient();
  const { data } = await supabase
    .from('students')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (!data) return null;
  return {
    id: data.id,
    email: data.email,
    contactNumber: data.contact_number,
    collegeName: data.college_name,
    academicYear: data.academic_year,
    degree: data.degree,
    referralCode: data.referral_code,
    passwordHash: data.password_hash,
    status: data.status,
    active: data.active,
    createdAt: data.created_at
  };
}

async function findStudentByReferralCode(code) {
  if (!code) return null;
  const supabase = getClient();
  const { data } = await supabase
    .from('students')
    .select('*')
    .eq('referral_code', String(code).trim().toUpperCase())
    .maybeSingle();

  if (!data) return null;
  return {
    id: data.id,
    email: data.email,
    contactNumber: data.contact_number,
    collegeName: data.college_name,
    academicYear: data.academic_year,
    degree: data.degree,
    referralCode: data.referral_code,
    passwordHash: data.password_hash,
    status: data.status,
    active: data.active,
    createdAt: data.created_at
  };
}

async function authenticateStudent(email, password) {
  const student = await findStudentByEmail(email);
  if (!student) return null;
  if (!verifyPassword(student.passwordHash, password)) return null;

  if (student.status === 'INACTIVE' || student.active === false) {
    const err = new Error('Your student account has been deactivated. Please contact administration for assistance.');
    err.code = 'ACCOUNT_DEACTIVATED';
    throw err;
  }

  return {
    id: student.id,
    email: student.email,
    contactNumber: student.contactNumber,
    collegeName: student.collegeName,
    academicYear: student.academicYear,
    degree: student.degree,
    referralCode: student.referralCode,
    status: student.status,
    active: student.active
  };
}

async function createSession(studentId) {
  const supabase = getClient();
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days

  await supabase.from('student_sessions').insert({
    token,
    student_id: studentId,
    created_at: new Date().toISOString(),
    expires_at: expiresAt
  });

  return { token, expiresAt };
}

async function getSession(token) {
  if (!token) return null;
  const supabase = getClient();
  const now = Date.now();

  const { data: session } = await supabase
    .from('student_sessions')
    .select('*, student:students(*)')
    .eq('token', token)
    .gt('expires_at', now)
    .maybeSingle();

  if (!session || !session.student) return null;
  if (session.student.status === 'INACTIVE' || session.student.active === false) return null;

  return {
    token: session.token,
    studentId: session.student_id,
    expiresAt: session.expires_at,
    student: {
      id: session.student.id,
      email: session.student.email,
      contactNumber: session.student.contact_number,
      collegeName: session.student.college_name,
      academicYear: session.student.academic_year,
      degree: session.student.degree,
      referralCode: session.student.referral_code,
      status: session.student.status,
      active: session.student.active
    }
  };
}

async function deleteSession(token) {
  if (!token) return;
  const supabase = getClient();
  await supabase.from('student_sessions').delete().eq('token', token);
}

// ----------------------------------------------------
// 2. ENROLLMENTS & PAYMENTS
// ----------------------------------------------------

async function isStudentPaid(studentId) {
  if (!studentId) return false;
  const supabase = getClient();
  const { data } = await supabase
    .from('enrollments')
    .select('id')
    .eq('student_id', studentId)
    .eq('status', 'PAID')
    .maybeSingle();
  return Boolean(data);
}

async function getStudentEnrollment(studentId) {
  if (!studentId) return null;
  const supabase = getClient();
  const { data } = await supabase
    .from('enrollments')
    .select('*')
    .eq('student_id', studentId)
    .maybeSingle();

  if (!data) return null;
  return {
    id: data.id,
    studentId: data.student_id,
    courseId: data.course_id,
    courseName: data.course_name,
    amount: Number(data.amount),
    currency: data.currency,
    status: data.status,
    referralCodeUsed: data.referral_code_used,
    cashfreeOrderId: data.cashfree_order_id,
    cashfreePaymentId: data.cashfree_payment_id,
    paymentMethod: data.payment_method,
    paymentTimestamp: data.payment_timestamp,
    createdAt: data.created_at,
    updatedAt: data.updated_at
  };
}

async function getEnrollmentByOrderId(orderId) {
  if (!orderId) return null;
  const supabase = getClient();
  const { data } = await supabase
    .from('enrollments')
    .select('*')
    .eq('cashfree_order_id', orderId)
    .maybeSingle();

  if (!data) return null;
  return {
    id: data.id,
    studentId: data.student_id,
    courseId: data.course_id,
    courseName: data.course_name,
    amount: Number(data.amount),
    currency: data.currency,
    status: data.status,
    referralCodeUsed: data.referral_code_used,
    cashfreeOrderId: data.cashfree_order_id,
    cashfreePaymentId: data.cashfree_payment_id,
    paymentMethod: data.payment_method,
    paymentTimestamp: data.payment_timestamp,
    createdAt: data.created_at,
    updatedAt: data.updated_at
  };
}

async function createOrUpdateEnrollment({ studentId, referralCodeUsed, orderId }) {
  const supabase = getClient();
  const existing = await getStudentEnrollment(studentId);

  if (existing && existing.status === 'PAID') {
    const err = new Error('Student is already enrolled and paid for this course.');
    err.code = 'ALREADY_PAID';
    throw err;
  }

  const now = new Date().toISOString();
  const refCode = referralCodeUsed ? String(referralCodeUsed).trim().toUpperCase() : null;

  if (existing) {
    const { data: updated, error } = await supabase
      .from('enrollments')
      .update({
        cashfree_order_id: orderId,
        referral_code_used: refCode || existing.referralCodeUsed,
        updated_at: now
      })
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) throw error;
    return updated;
  }

  const enrollment = {
    id: 'enr_' + crypto.randomBytes(8).toString('hex'),
    student_id: studentId,
    course_id: COURSE_ID,
    course_name: COURSE_NAME,
    amount: COURSE_FEE,
    currency: COURSE_CURRENCY,
    status: 'PENDING',
    referral_code_used: refCode,
    cashfree_order_id: orderId,
    created_at: now,
    updated_at: now
  };

  const { data, error } = await supabase.from('enrollments').insert(enrollment).select('*').single();
  if (error) throw error;
  return data;
}

async function markEnrollmentPaid({ orderId, cfPaymentId, paymentMethod, paymentTimestamp, rawDetails = {} }) {
  const supabase = getClient();
  const now = new Date().toISOString();

  // Call Atomic Stored Procedure
  const { data, error } = await supabase.rpc('activate_verified_payment', {
    p_order_id: orderId,
    p_cf_payment_id: cfPaymentId || `cf_sim_${crypto.randomBytes(6).toString('hex')}`,
    p_payment_method: paymentMethod || 'ONLINE',
    p_payment_timestamp: paymentTimestamp || now,
    p_amount: COURSE_FEE,
    p_currency: COURSE_CURRENCY,
    p_raw_details: rawDetails
  });

  if (error) throw error;
  if (!data || !data.success) {
    const err = new Error((data && data.message) || 'Payment activation failed.');
    err.code = (data && data.code) || 'ACTIVATION_FAILED';
    throw err;
  }

  return await getEnrollmentByOrderId(orderId);
}

async function markEnrollmentFailed({ orderId, rawDetails = {} }) {
  const supabase = getClient();
  const enrollment = await getEnrollmentByOrderId(orderId);
  if (!enrollment || enrollment.status === 'PAID') return enrollment;

  const now = new Date().toISOString();
  await supabase
    .from('enrollments')
    .update({ status: 'FAILED', updated_at: now })
    .eq('cashfree_order_id', orderId);

  // Check if payment attempt record exists
  const { data: existingPay } = await supabase
    .from('payments')
    .select('id')
    .eq('order_id', orderId)
    .maybeSingle();

  if (!existingPay) {
    await supabase.from('payments').insert({
      id: 'pay_' + crypto.randomBytes(8).toString('hex'),
      receipt_number: null,
      enrollment_id: enrollment.id,
      student_id: enrollment.studentId,
      course_name: enrollment.courseName || COURSE_NAME,
      order_id: orderId,
      cf_payment_id: null,
      amount: enrollment.amount,
      currency: enrollment.currency,
      status: 'FAILED',
      method: null,
      raw_details: rawDetails,
      timestamp: now
    });
  }

  return await getEnrollmentByOrderId(orderId);
}

async function getStudentPayments(studentId) {
  if (!studentId) return [];
  const supabase = getClient();

  const { data: payments } = await supabase
    .from('payments')
    .select('*')
    .eq('student_id', studentId)
    .order('timestamp', { ascending: false });

  return (payments || []).map((p) => ({
    id: p.id,
    receiptNumber: p.receipt_number,
    enrollmentId: p.enrollment_id,
    studentId: p.student_id,
    courseName: p.course_name,
    orderId: p.order_id,
    cfPaymentId: p.cf_payment_id,
    amount: Number(p.amount),
    currency: p.currency,
    status: p.status,
    method: p.method,
    rawDetails: p.raw_details,
    timestamp: p.timestamp
  }));
}

async function getPaymentReceipt({ studentId, paymentId }) {
  if (!studentId || !paymentId) return null;
  const supabase = getClient();

  const { data: payment, error: paymentErr } = await supabase
    .from('payments')
    .select('*')
    .eq('student_id', studentId)
    .or(`id.eq.${paymentId},order_id.eq.${paymentId},cf_payment_id.eq.${paymentId}`)
    .maybeSingle();

  if (paymentErr) {
    throw new Error(`Failed to retrieve payment receipt: ${paymentErr.message}`);
  }

  if (!payment) return null;

  if (payment.status !== 'PAID') {
    return {
      eligible: false,
      status: payment.status,
      message: 'Payment receipts are only generated for successfully verified payments.'
    };
  }

  const student = await findStudentById(studentId);

  return {
    eligible: true,
    receiptNumber: payment.receipt_number || generateReceiptNumber(payment.order_id, payment.id),
    paymentId: payment.id,
    orderId: payment.order_id,
    cfPaymentId: payment.cf_payment_id,
    courseName: payment.course_name || COURSE_NAME,
    amount: Number(payment.amount),
    currency: payment.currency,
    status: 'PAID',
    method: payment.method || 'Online',
    timestamp: payment.timestamp,
    student: {
      email: student ? student.email : '',
      degree: student ? student.degree : '',
      collegeName: student ? student.collegeName : '',
      contactNumber: student ? student.contactNumber : ''
    },
    company: {
      legalName: 'Saturn Technologies India Private Limited',
      shortName: 'Saturn Technologies',
      supportEmail: 'support@saturn.in',
      website: 'www.saturn.in'
    }
  };
}

// ----------------------------------------------------
// 3. REFERRALS & REWARDS
// ----------------------------------------------------

async function validateReferralCode(code, currentStudentId) {
  if (!code || typeof code !== 'string') {
    return { valid: false, message: 'Please enter a referral code.' };
  }
  const cleanCode = code.trim().toUpperCase();
  const referrer = await findStudentByReferralCode(cleanCode);

  if (!referrer) {
    return { valid: false, message: 'Invalid referral code. Please check and try again.' };
  }

  if (referrer.id === currentStudentId) {
    return { valid: false, message: 'You cannot use your own referral code.' };
  }

  const isReferrerPaid = await isStudentPaid(referrer.id);
  if (!isReferrerPaid) {
    return { valid: false, message: 'This referral code belongs to an account that has not completed course registration.' };
  }

  return {
    valid: true,
    referrerStudent: {
      id: referrer.id,
      email: referrer.email,
      referralCode: referrer.referralCode
    }
  };
}

async function getStudentReferralSummary(studentId) {
  if (!studentId) {
    return {
      referralCode: null,
      totalSuccessfulReferrals: 0,
      totalReferralRewards: 0,
      withdrawableBalance: 0,
      uncreditedRewards: 0,
      inProcessRewards: 0,
      history: []
    };
  }

  const supabase = getClient();
  const student = await findStudentById(studentId);
  const paid = await isStudentPaid(studentId);
  const referralCode = paid ? student.referralCode : null;

  const { data: rewards } = await supabase
    .from('referral_rewards')
    .select('*')
    .eq('referrer_student_id', studentId)
    .order('created_at', { ascending: false });

  const studentRewards = rewards || [];
  const totalSuccessfulReferrals = studentRewards.length;
  const totalReferralRewards = studentRewards.reduce((s, r) => s + Number(r.reward_amount || 0), 0);

  // Withdrawable balance is strictly credited rewards
  const withdrawableBalance = studentRewards
    .filter((r) => r.status === REWARD_STATUS.CREDITED)
    .reduce((s, r) => s + Number(r.reward_amount || 0), 0);

  const uncreditedRewards = studentRewards
    .filter((r) => r.status === REWARD_STATUS.UNCREDITED)
    .reduce((s, r) => s + Number(r.reward_amount || 0), 0);

  const inProcessRewards = studentRewards
    .filter((r) => r.status === REWARD_STATUS.IN_PROCESS)
    .reduce((s, r) => s + Number(r.reward_amount || 0), 0);

  const history = studentRewards.map((r) => {
    const rawEmail = r.referred_student_email || '';
    const parts = rawEmail.split('@');
    const masked = parts.length === 2 ? parts[0].slice(0, 2) + '***@' + parts[1] : rawEmail;
    return {
      id: r.id,
      referredIdentifier: masked || `Student #${r.referred_student_id.slice(-6).toUpperCase()}`,
      referredDegree: r.referred_student_degree || '',
      referredCollege: r.referred_student_college || '',
      date: r.created_at,
      rewardAmount: Number(r.reward_amount),
      currency: r.currency || 'INR',
      status: r.status
    };
  });

  return {
    referralCode,
    totalSuccessfulReferrals,
    totalReferralRewards,
    withdrawableBalance,
    uncreditedRewards,
    inProcessRewards,
    history
  };
}

// ----------------------------------------------------
// 4. ADMIN AUTHENTICATION & MANAGEMENT
// ----------------------------------------------------

async function getMasterAdmin() {
  const supabase = getClient();
  const { data } = await supabase.from('admins').select('*').limit(1).maybeSingle();
  return data;
}

async function authenticateAdmin(email, password) {
  const admin = await getMasterAdmin();
  if (!admin) return null;
  if (admin.email.toLowerCase() !== String(email || '').trim().toLowerCase()) return null;
  if (!verifyPassword(admin.password_hash, password)) return null;

  const session = await createAdminSession(admin);
  return {
    token: session.token,
    admin: { id: admin.id, email: admin.email, role: admin.role }
  };
}

async function createAdminSession(admin) {
  const supabase = getClient();
  const token = 'adm_sess_' + crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

  await supabase.from('admin_sessions').insert({
    token,
    admin_id: admin.id,
    email: admin.email,
    role: admin.role,
    created_at: new Date().toISOString(),
    expires_at: expiresAt
  });

  await logAdminAction({
    action: 'ADMIN_LOGIN_SUCCESS',
    details: { email: admin.email },
    adminEmail: admin.email,
    adminId: admin.id
  });

  return { token, expiresAt };
}

async function getAdminSession(token) {
  if (!token) return null;
  const supabase = getClient();
  const now = Date.now();

  const { data: session } = await supabase
    .from('admin_sessions')
    .select('*, admin:admins(*)')
    .eq('token', token)
    .gt('expires_at', now)
    .maybeSingle();

  if (!session || !session.admin) return null;

  return {
    token: session.token,
    admin: { id: session.admin.id, email: session.admin.email, role: session.admin.role },
    expiresAt: session.expires_at
  };
}

async function deleteAdminSession(token) {
  if (!token) return;
  const supabase = getClient();
  await supabase.from('admin_sessions').delete().eq('token', token);
}

async function logAdminAction({ action, details = {}, adminEmail = 'admin@saturn.in', adminId = null }) {
  try {
    const supabase = getClient();
    const id = 'aud_' + crypto.randomBytes(8).toString('hex');
    await supabase.from('admin_audit_logs').insert({
      id,
      admin_id: adminId,
      action,
      details,
      admin_email: adminEmail,
      timestamp: new Date().toISOString()
    });
  } catch (_) {}
}

async function getAdminStats() {
  const supabase = getClient();

  const { count: totalStudents, error: errTotalStudents } = await supabase.from('students').select('*', { count: 'exact', head: true });
  if (errTotalStudents) throw new Error(`Failed to count students: ${errTotalStudents.message}`);

  const { count: paidStudents, error: errPaidStudents } = await supabase.from('enrollments').select('*', { count: 'exact', head: true }).eq('status', 'PAID');
  if (errPaidStudents) throw new Error(`Failed to count paid students: ${errPaidStudents.message}`);

  const { count: pendingPayments, error: errPendingPayments } = await supabase.from('enrollments').select('*', { count: 'exact', head: true }).eq('status', 'PENDING');
  if (errPendingPayments) throw new Error(`Failed to count pending payments: ${errPendingPayments.message}`);

  const { count: failedPayments, error: errFailedPayments } = await supabase.from('payments').select('*', { count: 'exact', head: true }).eq('status', 'FAILED');
  if (errFailedPayments) throw new Error(`Failed to count failed payments: ${errFailedPayments.message}`);

  const { count: totalReferrals, error: errTotalReferrals } = await supabase.from('referral_rewards').select('*', { count: 'exact', head: true });
  if (errTotalReferrals) throw new Error(`Failed to count referrals: ${errTotalReferrals.message}`);

  const { count: rewardsCredited, error: errRewardsCredited } = await supabase.from('referral_rewards').select('*', { count: 'exact', head: true }).eq('status', REWARD_STATUS.CREDITED);
  if (errRewardsCredited) throw new Error(`Failed to count credited rewards: ${errRewardsCredited.message}`);

  const { count: rewardsAwaitingCredit, error: errRewardsAwaitingCredit } = await supabase.from('referral_rewards').select('*', { count: 'exact', head: true }).neq('status', REWARD_STATUS.CREDITED);
  if (errRewardsAwaitingCredit) throw new Error(`Failed to count awaiting rewards: ${errRewardsAwaitingCredit.message}`);

  // Calculate revenue directly from actual verified PAID payment records
  const { data: verifiedPaymentRows, error: errVerifiedRevenue } = await supabase
    .from('payments')
    .select('amount, student_id')
    .eq('status', 'PAID');
  if (errVerifiedRevenue) {
    throw new Error(`Failed to query verified payments for revenue: ${errVerifiedRevenue.message}`);
  }
  const verifiedRevenue = (verifiedPaymentRows || []).reduce((sum, p) => sum + (Number(p.amount) || COURSE_FEE), 0);
  const paidStudentIdSet = new Set((verifiedPaymentRows || []).map((p) => p.student_id).filter(Boolean));

  // Recent students
  const { data: recentStudents, error: errRecentStudents } = await supabase
    .from('students')
    .select('id, email, degree, college_name, created_at, status')
    .order('created_at', { ascending: false })
    .limit(5);
  if (errRecentStudents) {
    throw new Error(`Failed to fetch recent students: ${errRecentStudents.message}`);
  }

  // Also check enrollments for recent students if needed
  const recentStIds = (recentStudents || []).map((s) => s.id);
  if (recentStIds.length > 0) {
    const { data: rEnrollments } = await supabase
      .from('enrollments')
      .select('student_id')
      .in('student_id', recentStIds)
      .eq('status', 'PAID');
    (rEnrollments || []).forEach((e) => paidStudentIdSet.add(e.student_id));
  }

  // Recent payments
  const { data: recentPayments, error: errRecentPayments } = await supabase
    .from('payments')
    .select('id, order_id, cf_payment_id, student_id, amount, status, timestamp, method')
    .order('timestamp', { ascending: false })
    .limit(5);
  if (errRecentPayments) {
    throw new Error(`Failed to fetch recent payments: ${errRecentPayments.message}`);
  }

  const recentStudentIds = Array.from(new Set((recentPayments || []).map((p) => p.student_id).filter(Boolean)));
  let recentStudentMap = new Map();
  if (recentStudentIds.length > 0) {
    const { data: rStudents, error: errRStudents } = await supabase
      .from('students')
      .select('id, email, college_name')
      .in('id', recentStudentIds);
    if (errRStudents) {
      throw new Error(`Failed to fetch students for recent payments: ${errRStudents.message}`);
    }
    recentStudentMap = new Map((rStudents || []).map((s) => [s.id, s]));
  }

  return {
    stats: {
      totalStudents: totalStudents || 0,
      paidStudents: paidStudents || 0,
      pendingPayments: pendingPayments || 0,
      failedPayments: failedPayments || 0,
      verifiedRevenue,
      totalRevenue: verifiedRevenue,
      totalReferrals: totalReferrals || 0,
      rewardsAwaitingCredit: rewardsAwaitingCredit || 0,
      rewardsCredited: rewardsCredited || 0
    },
    recentStudents: (recentStudents || []).map((s) => ({
      id: s.id,
      name: s.email ? s.email.split('@')[0] : 'Student',
      fullName: s.email ? s.email.split('@')[0] : 'Student',
      email: s.email,
      degree: s.degree,
      college: s.college_name || '—',
      collegeName: s.college_name,
      createdAt: s.created_at,
      paid: paidStudentIdSet.has(s.id),
      isPaid: paidStudentIdSet.has(s.id),
      status: s.status
    })),
    recentPayments: (recentPayments || []).map((p) => {
      const st = recentStudentMap.get(p.student_id);
      return {
        id: p.id,
        orderId: p.order_id,
        cfPaymentId: p.cf_payment_id,
        paymentId: p.cf_payment_id || p.id,
        transactionId: p.cf_payment_id || p.order_id || p.id,
        studentName: st ? st.email.split('@')[0] : 'Student',
        studentEmail: st ? st.email : '—',
        amount: Number(p.amount),
        status: p.status,
        timestamp: p.timestamp,
        createdAt: p.timestamp,
        paidAt: p.status === 'PAID' ? p.timestamp : null,
        method: p.method || 'Online'
      };
    }),
    recentReferrals: []
  };
}

async function getAdminStudents({ search = '', status = 'ALL' } = {}) {
  const supabase = getClient();

  // 1. Fetch student records and verified paid student IDs from enrollments and payments
  const [
    { data: students, error: studentsError },
    { data: paidEnrollments, error: enrollmentsError },
    { data: paidPayments, error: paymentsError }
  ] = await Promise.all([
    supabase.from('students').select('*').order('created_at', { ascending: false }),
    supabase.from('enrollments').select('student_id').eq('status', 'PAID'),
    supabase.from('payments').select('student_id').eq('status', 'PAID')
  ]);

  if (studentsError) {
    throw new Error(`Failed to fetch students directory: ${studentsError.message}`);
  }
  if (enrollmentsError) {
    throw new Error(`Failed to query verified student enrollments: ${enrollmentsError.message}`);
  }
  if (paymentsError) {
    throw new Error(`Failed to query verified student payments: ${paymentsError.message}`);
  }

  // 2. Combine verified paid student IDs into a fast lookup Set
  const paidStudentIds = new Set([
    ...(paidEnrollments || []).map((e) => e.student_id),
    ...(paidPayments || []).map((p) => p.student_id)
  ].filter(Boolean));

  // 3. Map student records with expected frontend fields and accurate paid status
  const mapped = (students || []).map((s) => {
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

  // 4. Apply status and search filtering
  const q = String(search || '').trim().toLowerCase();
  const filterStatus = String(status || 'ALL').toUpperCase();

  return mapped.filter((st) => {
    // Payment status filters
    if (filterStatus === 'PAID' && !st.isPaid) return false;
    if (filterStatus === 'UNPAID' && st.isPaid) return false;

    // Account status filters (separate from payment status)
    if (filterStatus === 'ACTIVE' && (st.status !== 'ACTIVE' || st.active === false)) return false;
    if (filterStatus === 'INACTIVE' && (st.status === 'ACTIVE' && st.active !== false)) return false;

    // Search query matching
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

async function toggleStudentStatus(studentId, adminEmail = 'admin@saturn.in', targetActive = undefined) {
  const supabase = getClient();
  const student = await findStudentById(studentId);
  if (!student) {
    const err = new Error('Student not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  let nextStatus;
  if (typeof targetActive === 'boolean') {
    nextStatus = targetActive ? 'ACTIVE' : 'INACTIVE';
  } else {
    nextStatus = student.status === 'INACTIVE' ? 'ACTIVE' : 'INACTIVE';
  }

  const now = new Date().toISOString();
  await supabase
    .from('students')
    .update({ status: nextStatus, active: nextStatus === 'ACTIVE', updated_at: now })
    .eq('id', studentId);

  // If student was deactivated, revoke all student sessions
  if (nextStatus === 'INACTIVE') {
    await supabase.from('student_sessions').delete().eq('student_id', studentId);
  }

  await logAdminAction({
    action: 'STUDENT_STATUS_TOGGLED',
    details: { studentId, email: student.email, newStatus: nextStatus },
    adminEmail
  });

  return await findStudentById(studentId);
}

async function getAdminPayments({ search = '', status = 'ALL' } = {}) {
  const supabase = getClient();
  let query = supabase.from('payments').select('*').order('timestamp', { ascending: false });

  if (status !== 'ALL') {
    const normalizedStatus = status === 'SUCCESSFUL' ? 'PAID' : status;
    query = query.eq('status', normalizedStatus);
  }
  if (search) {
    query = query.or(`order_id.ilike.%${search}%,cf_payment_id.ilike.%${search}%,receipt_number.ilike.%${search}%`);
  }

  const { data: payments, error: paymentsError } = await query;
  if (paymentsError) {
    throw new Error(`Failed to fetch admin payments: ${paymentsError.message}`);
  }

  const studentIds = Array.from(new Set((payments || []).map((p) => p.student_id).filter(Boolean)));
  let studentMap = new Map();
  if (studentIds.length > 0) {
    const { data: students, error: studentsError } = await supabase
      .from('students')
      .select('id, email, contact_number, college_name, degree')
      .in('id', studentIds);
    if (studentsError) {
      throw new Error(`Failed to fetch student details for payments: ${studentsError.message}`);
    }
    studentMap = new Map((students || []).map((s) => [s.id, s]));
  }

  const records = (payments || []).map((p) => {
    const student = studentMap.get(p.student_id);
    const cfId = p.cf_payment_id || null;
    const paymentTimestamp = p.timestamp || null;
    return {
      id: p.id,
      orderId: p.order_id,
      cfPaymentId: cfId,
      paymentId: cfId || p.id,
      transactionId: cfId || p.order_id || p.id,
      receiptNumber: p.receipt_number || null,
      studentId: p.student_id,
      studentName: student ? student.email.split('@')[0] : 'Student',
      studentEmail: student ? student.email : 'Unknown',
      studentPhone: student ? student.contact_number : '',
      studentCollege: student ? student.college_name : '',
      studentDegree: student ? student.degree : '',
      courseName: p.course_name || COURSE_NAME,
      amount: Number(p.amount),
      currency: p.currency || 'INR',
      status: p.status,
      method: p.method || 'Online',
      timestamp: paymentTimestamp,
      createdAt: paymentTimestamp,
      paidAt: p.status === 'PAID' ? paymentTimestamp : null
    };
  });

  const totalRevenue = records
    .filter((p) => p.status === 'PAID')
    .reduce((s, p) => s + p.amount, 0);

  return {
    payments: records,
    totalRevenue,
    totalCount: records.length
  };
}

async function getAdminReferrals({ search = '', status = 'ALL' } = {}) {
  const supabase = getClient();
  let query = supabase
    .from('referral_rewards')
    .select('*, referrer:students!referrer_student_id(*), referred:students!referred_student_id(*)')
    .order('created_at', { ascending: false });

  if (status !== 'ALL') {
    query = query.eq('status', status);
  }

  const { data: rewards } = await query;
  return (rewards || []).map((r) => ({
    id: r.id,
    enrollmentId: r.enrollment_id,
    orderId: r.order_id,
    referralCode: r.referral_code,
    rewardAmount: Number(r.reward_amount),
    currency: r.currency,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    creditedAt: r.credited_at,
    referrer: r.referrer ? { id: r.referrer.id, email: r.referrer.email, referralCode: r.referrer.referral_code } : null,
    referred: r.referred ? { id: r.referred.id, email: r.referred.email, college: r.referred.college_name } : null
  }));
}

async function updateReferralRewardStatusAdmin({ rewardId, newStatus, adminEmail = 'admin@saturn.in' }) {
  const validStatuses = Object.values(REWARD_STATUS);
  if (!validStatuses.includes(newStatus)) {
    throw new Error('Invalid reward status.');
  }

  const supabase = getClient();
  const admin = await getMasterAdmin();

  // If transitioning to CREDITED, execute atomic credit procedure
  if (newStatus === REWARD_STATUS.CREDITED) {
    const { data, error } = await supabase.rpc('credit_referral_reward', {
      p_reward_id: rewardId,
      p_admin_id: admin ? admin.id : 'adm_master_saturn_01',
      p_admin_email: adminEmail,
      p_notes: 'Approved and credited by administrator'
    });

    if (error) throw error;
    if (!data || !data.success) {
      throw new Error((data && data.message) || 'Referral credit failed.');
    }
  } else {
    // Intermediate status progression
    await supabase
      .from('referral_rewards')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', rewardId);

    await logAdminAction({
      action: 'REFERRAL_REWARD_STATUS_UPDATED',
      details: { rewardId, newStatus },
      adminEmail,
      adminId: admin ? admin.id : null
    });
  }

  const { data: updated } = await supabase.from('referral_rewards').select('*').eq('id', rewardId).single();
  return updated;
}

// ----------------------------------------------------
// 5. COURSE MATERIALS & STORAGE STREAMING
// ----------------------------------------------------

async function getCourseMaterials({ studentId }) {
  const supabase = getClient();
  const { data: materials } = await supabase
    .from('materials')
    .select('*')
    .eq('active', true)
    .order('display_order', { ascending: true });

  const isPaid = studentId ? await isStudentPaid(studentId) : false;

  return {
    ok: true,
    isPaid,
    materials: (materials || []).map((m) => ({
      id: m.id,
      title: m.title,
      category: m.category,
      description: m.description,
      fileName: m.file_name,
      fileSize: Number(m.file_size),
      pageCount: m.page_count,
      active: m.active
    }))
  };
}

async function getCourseMaterialFile(arg) {
  let materialId;
  let studentId = null;
  if (typeof arg === 'string') {
    materialId = arg;
  } else if (arg && typeof arg === 'object') {
    materialId = arg.materialId;
    studentId = arg.studentId;
  }

  if (!materialId) {
    return { ok: false, status: 400, error: 'BAD_REQUEST', message: 'Material ID is required.' };
  }

  // If studentId provided, enforce paid student verification
  if (studentId) {
    const isPaid = await isStudentPaid(studentId);
    if (!isPaid) {
      return { ok: false, status: 403, error: 'COURSE_NOT_PURCHASED', message: 'Course materials are only accessible to paid students.' };
    }
  }

  const supabase = getClient();
  const { data: material, error: matErr } = await supabase
    .from('materials')
    .select('*')
    .eq('id', materialId)
    .maybeSingle();

  if (matErr || !material) {
    return { ok: false, status: 404, error: 'MATERIAL_NOT_FOUND', message: 'Course material not found.' };
  }

  // Strictly download from private Supabase Storage bucket 'course-materials'
  const storagePath = material.storage_path || `materials/${material.file_name}`;
  let downloadRes = await supabase.storage.from('course-materials').download(storagePath);
  if (downloadRes.error && storagePath !== material.file_name) {
    downloadRes = await supabase.storage.from('course-materials').download(material.file_name);
  }

  if (downloadRes.error || !downloadRes.data) {
    return { ok: false, status: 404, error: 'FILE_NOT_FOUND', message: 'PDF document not found in storage.' };
  }

  const buffer = Buffer.from(await downloadRes.data.arrayBuffer());
  return {
    ok: true,
    buffer,
    size: buffer.length,
    material: { id: material.id, title: material.title, fileName: material.file_name }
  };
}

async function getStudentReferrals(studentId) {
  if (!studentId) return [];
  const supabase = getClient();
  const { data: rewards } = await supabase
    .from('referral_rewards')
    .select('*')
    .eq('referrer_student_id', studentId)
    .order('created_at', { ascending: false });

  return (rewards || []).map((r) => ({
    id: r.id,
    referrerStudentId: r.referrer_student_id,
    referredStudentId: r.referred_student_id,
    referredStudentEmail: r.referred_student_email,
    referredStudentDegree: r.referred_student_degree,
    referredStudentCollege: r.referred_student_college,
    enrollmentId: r.enrollment_id,
    orderId: r.order_id,
    referralCode: r.referral_code,
    rewardAmount: Number(r.reward_amount),
    currency: r.currency,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    creditedAt: r.credited_at,
    adminNotes: r.admin_notes
  }));
}

async function getAdminStudentDetail(studentId) {
  if (!studentId) return null;
  const student = await findStudentById(studentId);
  if (!student) return null;

  const isPaid = await isStudentPaid(student.id);
  const enrollment = await getStudentEnrollment(student.id);
  const payments = await getStudentPayments(student.id);
  const referrals = await getStudentReferrals(student.id);
  const referralSummary = await getStudentReferralSummary(student.id);

  const displayName = student.email ? student.email.split('@')[0] : 'Student';

  return {
    student: {
      id: student.id,
      name: displayName,
      fullName: displayName,
      email: student.email,
      phone: student.contactNumber || '',
      contactNumber: student.contactNumber,
      college: student.collegeName || '',
      collegeName: student.collegeName,
      academicYear: student.academicYear,
      degree: student.degree,
      referralCode: student.referralCode,
      createdAt: student.createdAt,
      status: student.status || 'ACTIVE',
      active: student.status !== 'INACTIVE' && student.active !== false,
      paid: isPaid,
      isPaid
    },
    enrollment,
    payments,
    referrals,
    referralSummary
  };
}

async function getAdminMaterials() {
  const supabase = getClient();
  const { data: materials, error } = await supabase
    .from('materials')
    .select('*')
    .order('display_order', { ascending: true });

  if (error) throw error;

  return (materials || []).map((m) => ({
    id: m.id,
    courseId: m.course_id,
    title: m.title,
    category: m.category,
    description: m.description,
    fileName: m.file_name,
    fileSize: m.file_size,
    pageCount: m.page_count,
    order: m.display_order,
    active: m.active !== false,
    updatedAt: m.updated_at,
    fileExists: true
  }));
}

async function uploadAdminMaterial({ title, category, description, fileName, pdfBuffer, adminEmail = 'admin@saturn.in' }) {
  if (!title || !title.trim()) {
    throw new Error('Material title is required.');
  }
  if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0) {
    throw new Error('A valid PDF file buffer is required.');
  }

  // Verify PDF magic bytes
  const header = pdfBuffer.slice(0, 8).toString('utf8');
  if (!header.startsWith('%PDF-')) {
    throw new Error('Invalid file format. Document must be a genuine PDF file (%PDF-).');
  }

  if (pdfBuffer.length > 15 * 1024 * 1024) {
    throw new Error('File size exceeds the 15MB limit.');
  }

  const safeName = (fileName || 'document.pdf')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .toLowerCase();
  const ext = path.extname(safeName) || '.pdf';
  const base = path.basename(safeName, ext);
  const targetFileName = `${base}_${Date.now()}${ext}`;
  const storagePath = `materials/${targetFileName}`;

  const supabase = getClient();

  // 1. Upload to private Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from('course-materials')
    .upload(storagePath, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: false
    });

  if (uploadError) {
    throw new Error(`Failed to upload PDF to Supabase Storage: ${uploadError.message}`);
  }

  // 2. Calculate page count
  const pdfString = pdfBuffer.toString('binary');
  const countMatches = pdfString.match(/\/Type\s*\/Page[^s]/g);
  const pageCount = countMatches ? countMatches.length : 1;

  // 3. Get max order
  const { count } = await supabase.from('materials').select('*', { count: 'exact', head: true });
  const displayOrder = (count || 0) + 1;

  const newMaterialId = 'mat_' + crypto.randomBytes(6).toString('hex');
  const now = new Date().toISOString();

  // 4. Insert into database
  const { data: newMaterial, error: insertError } = await supabase
    .from('materials')
    .insert({
      id: newMaterialId,
      course_id: COURSE_ID,
      title: title.trim(),
      category: (category || 'Course Material').trim(),
      description: (description || '').trim(),
      file_name: targetFileName,
      file_size: pdfBuffer.length,
      storage_path: storagePath,
      page_count: pageCount,
      display_order: displayOrder,
      active: true,
      created_at: now,
      updated_at: now
    })
    .select('*')
    .single();

  if (insertError) {
    // Rollback storage upload
    await supabase.storage.from('course-materials').remove([storagePath]);
    throw new Error(`Failed to save material record: ${insertError.message}`);
  }

  const admin = await getMasterAdmin();
  await logAdminAction({
    action: 'MATERIAL_UPLOADED',
    details: { id: newMaterial.id, title: newMaterial.title, fileName: targetFileName },
    adminEmail,
    adminId: admin ? admin.id : null
  });

  return {
    id: newMaterial.id,
    courseId: newMaterial.course_id,
    title: newMaterial.title,
    category: newMaterial.category,
    description: newMaterial.description,
    fileName: newMaterial.file_name,
    fileSize: Math.round(pdfBuffer.length / 1024) + ' KB',
    pageCount: newMaterial.page_count,
    order: newMaterial.display_order,
    active: newMaterial.active,
    updatedAt: newMaterial.updated_at
  };
}

async function updateAdminMaterial({ materialId, title, category, description, order, active, adminEmail = 'admin@saturn.in' }) {
  if (!materialId) {
    throw new Error('Material ID is required.');
  }

  const supabase = getClient();
  const { data: material, error: findError } = await supabase
    .from('materials')
    .select('*')
    .eq('id', materialId)
    .maybeSingle();

  if (findError || !material) {
    throw new Error('Material record not found.');
  }

  const updates = { updated_at: new Date().toISOString() };
  if (title) updates.title = title.trim();
  if (category) updates.category = category.trim();
  if (description !== undefined) updates.description = description.trim();
  if (order !== undefined) updates.display_order = Number(order) || 1;
  if (active !== undefined) updates.active = Boolean(active);

  const { data: updated, error: updateError } = await supabase
    .from('materials')
    .update(updates)
    .eq('id', materialId)
    .select('*')
    .single();

  if (updateError) throw updateError;

  const admin = await getMasterAdmin();
  await logAdminAction({
    action: 'MATERIAL_UPDATED',
    details: { materialId, title: updated.title, active: updated.active },
    adminEmail,
    adminId: admin ? admin.id : null
  });

  return {
    id: updated.id,
    courseId: updated.course_id,
    title: updated.title,
    category: updated.category,
    description: updated.description,
    fileName: updated.file_name,
    fileSize: Math.round(Number(updated.file_size || 0) / 1024) + ' KB',
    pageCount: updated.page_count,
    order: updated.display_order,
    active: updated.active,
    updatedAt: updated.updated_at
  };
}

async function replaceAdminMaterialFile({ materialId, fileName, pdfBuffer, adminEmail = 'admin@saturn.in' }) {
  if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0) {
    throw new Error('A valid PDF file buffer is required.');
  }
  const header = pdfBuffer.slice(0, 8).toString('utf8');
  if (!header.startsWith('%PDF-')) {
    throw new Error('Invalid file format. Only valid PDF files are permitted.');
  }
  if (pdfBuffer.length > 15 * 1024 * 1024) {
    throw new Error('File size exceeds the 15MB limit.');
  }

  const supabase = getClient();
  const { data: material, error: findError } = await supabase
    .from('materials')
    .select('*')
    .eq('id', materialId)
    .maybeSingle();

  if (findError || !material) {
    throw new Error('Material record not found.');
  }

  const safeName = (fileName || material.file_name || 'document.pdf')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .toLowerCase();
  const ext = path.extname(safeName) || '.pdf';
  const targetFileName = `${path.basename(safeName, ext)}_${Date.now()}${ext}`;
  const newStoragePath = `materials/${targetFileName}`;

  // 1. Upload new file
  const { error: uploadError } = await supabase.storage
    .from('course-materials')
    .upload(newStoragePath, pdfBuffer, { contentType: 'application/pdf', upsert: false });

  if (uploadError) {
    throw new Error(`Failed to upload replacement PDF: ${uploadError.message}`);
  }

  // 2. Calculate page count
  const pdfString = pdfBuffer.toString('binary');
  const countMatches = pdfString.match(/\/Type\s*\/Page[^s]/g);
  const pageCount = countMatches ? countMatches.length : 1;

  // 3. Update database record
  const { data: updated, error: updateError } = await supabase
    .from('materials')
    .update({
      file_name: targetFileName,
      file_size: pdfBuffer.length,
      storage_path: newStoragePath,
      page_count: pageCount,
      updated_at: new Date().toISOString()
    })
    .eq('id', materialId)
    .select('*')
    .single();

  if (updateError) {
    // Rollback new storage file
    await supabase.storage.from('course-materials').remove([newStoragePath]);
    throw updateError;
  }

  // 4. Safely remove old file from storage
  const oldStoragePath = material.storage_path || `materials/${material.file_name}`;
  try {
    await supabase.storage.from('course-materials').remove([oldStoragePath, material.file_name]);
  } catch (_) {}

  const admin = await getMasterAdmin();
  await logAdminAction({
    action: 'MATERIAL_FILE_REPLACED',
    details: { materialId, fileName: targetFileName },
    adminEmail,
    adminId: admin ? admin.id : null
  });

  return {
    id: updated.id,
    courseId: updated.course_id,
    title: updated.title,
    category: updated.category,
    description: updated.description,
    fileName: updated.file_name,
    fileSize: Math.round(pdfBuffer.length / 1024) + ' KB',
    pageCount: updated.page_count,
    order: updated.display_order,
    active: updated.active,
    updatedAt: updated.updated_at
  };
}

async function deleteAdminMaterial(materialId, adminEmail = 'admin@saturn.in') {
  if (!materialId) {
    throw new Error('Material ID is required.');
  }

  const supabase = getClient();
  const { data: material, error: findError } = await supabase
    .from('materials')
    .select('*')
    .eq('id', materialId)
    .maybeSingle();

  if (findError || !material) {
    throw new Error('Material record not found.');
  }

  // 1. Delete database record
  const { error: deleteError } = await supabase
    .from('materials')
    .delete()
    .eq('id', materialId);

  if (deleteError) throw deleteError;

  // 2. Delete file from storage
  const storagePath = material.storage_path || `materials/${material.file_name}`;
  try {
    await supabase.storage.from('course-materials').remove([storagePath, material.file_name]);
  } catch (_) {}

  const admin = await getMasterAdmin();
  await logAdminAction({
    action: 'MATERIAL_DELETED',
    details: { materialId, title: material.title },
    adminEmail,
    adminId: admin ? admin.id : null
  });

  return true;
}

async function changeAdminPassword({ adminId, currentPassword, newPassword }) {
  const supabase = getClient();
  const admin = await getMasterAdmin();
  if (!admin || admin.id !== adminId) {
    const err = new Error('Admin account not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  if (!verifyPassword(admin.password_hash, currentPassword)) {
    const err = new Error('Current password is incorrect.');
    err.code = 'INVALID_PASSWORD';
    throw err;
  }

  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
    const err = new Error('New password must be at least 8 characters long.');
    err.code = 'WEAK_PASSWORD';
    throw err;
  }

  const newHash = hashPassword(newPassword);
  const now = new Date().toISOString();

  // 1. Update password hash
  const { error: updateError } = await supabase
    .from('admins')
    .update({ password_hash: newHash, updated_at: now })
    .eq('id', admin.id);

  if (updateError) throw updateError;

  // 2. Invalidate all active admin sessions
  await supabase.from('admin_sessions').delete().eq('admin_id', admin.id);

  await logAdminAction({
    action: 'ADMIN_PASSWORD_CHANGED',
    details: { adminId: admin.id },
    adminEmail: admin.email,
    adminId: admin.id
  });

  return true;
}

async function getAdminAuditLogs(limit = 50) {
  const supabase = getClient();
  const safeLimit = Math.min(Math.max(1, Number(limit) || 50), 100);

  const { data: logs, error } = await supabase
    .from('admin_audit_logs')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(safeLimit);

  if (error) throw error;

  return (logs || []).map((l) => ({
    id: l.id,
    adminId: l.admin_id,
    action: l.action,
    details: l.details,
    adminEmail: l.admin_email,
    timestamp: l.timestamp
  }));
}

// ----------------------------------------------------
// 6. RATE LIMITING
// ----------------------------------------------------

async function checkLoginRateLimit(ip, email) {
  const supabase = getClient();
  const cleanIp = String(ip || '127.0.0.1').trim();
  const cleanEmail = String(email || '').trim().toLowerCase();
  const key = `${cleanIp}:${cleanEmail}`;
  const now = Date.now();

  const { data: record } = await supabase
    .from('rate_limits')
    .select('*')
    .eq('key', key)
    .maybeSingle();

  if (record) {
    if (now - record.first_attempt_at > RATE_LIMIT_WINDOW_MS) {
      return { allowed: true, remaining: RATE_LIMIT_MAX_ATTEMPTS };
    }
    if (record.attempts >= RATE_LIMIT_MAX_ATTEMPTS) {
      const waitSeconds = Math.max(1, Math.ceil((record.first_attempt_at + RATE_LIMIT_WINDOW_MS - now) / 1000));
      const waitMinutes = Math.max(1, Math.ceil(waitSeconds / 60));
      return {
        allowed: false,
        waitSeconds,
        retryAfterSeconds: waitSeconds,
        retryAfterMinutes: waitMinutes,
        message: `Too many failed login attempts. Please try again after ${waitMinutes} minute${waitMinutes > 1 ? 's' : ''}.`
      };
    }
    return { allowed: true, remaining: RATE_LIMIT_MAX_ATTEMPTS - record.attempts };
  }

  return { allowed: true, remaining: RATE_LIMIT_MAX_ATTEMPTS };
}

async function recordFailedLoginAttempt(ip, email) {
  const supabase = getClient();
  const cleanIp = String(ip || '127.0.0.1').trim();
  const cleanEmail = String(email || '').trim().toLowerCase();
  const key = `${cleanIp}:${cleanEmail}`;
  const now = Date.now();

  const { data: record } = await supabase
    .from('rate_limits')
    .select('*')
    .eq('key', key)
    .maybeSingle();

  let attempts = 1;
  if (!record) {
    await supabase.from('rate_limits').insert({
      key,
      attempts: 1,
      first_attempt_at: now,
      last_attempt_at: now
    });
  } else {
    if (now - record.first_attempt_at > RATE_LIMIT_WINDOW_MS) {
      attempts = 1;
      await supabase.from('rate_limits').update({
        attempts: 1,
        first_attempt_at: now,
        last_attempt_at: now
      }).eq('key', key);
    } else {
      attempts = record.attempts + 1;
      await supabase.from('rate_limits').update({
        attempts,
        last_attempt_at: now
      }).eq('key', key);
    }
  }

  return {
    attempts,
    count: attempts,
    remaining: Math.max(0, RATE_LIMIT_MAX_ATTEMPTS - attempts)
  };
}

async function clearLoginRateLimit(ip, email) {
  const supabase = getClient();
  const cleanIp = String(ip || '127.0.0.1').trim();
  const cleanEmail = String(email || '').trim().toLowerCase();
  const key = `${cleanIp}:${cleanEmail}`;
  await supabase.from('rate_limits').delete().eq('key', key);
}

async function ensureStudentReferralCode(student) {
  if (!student) return null;
  if (student.referralCode || student.referral_code) return student.referralCode || student.referral_code;
  const supabase = getClient();
  const code = 'SATURN-REFE-' + crypto.randomBytes(3).toString('hex').toUpperCase();
  await supabase.from('students').update({ referral_code: code, updated_at: new Date().toISOString() }).eq('id', student.id);
  return code;
}

async function createReferralRewardForEnrollment({ enrollmentId, referrerStudentId, referredStudentId }) {
  const supabase = getClient();
  const id = 'rew_' + crypto.randomBytes(8).toString('hex');
  const student = await findStudentById(referredStudentId);
  const enrollment = await getStudentEnrollment(referredStudentId);

  const { data, error } = await supabase.from('referral_rewards').insert({
    id,
    referrer_student_id: referrerStudentId,
    referred_student_id: referredStudentId,
    referred_student_email: student ? student.email : '',
    referred_student_degree: student ? student.degree : '',
    referred_student_college: student ? student.collegeName : '',
    enrollment_id: enrollmentId,
    order_id: enrollment ? enrollment.cashfreeOrderId : '',
    referral_code: enrollment ? enrollment.referralCodeUsed : '',
    reward_amount: REFERRAL_REWARD_AMOUNT,
    currency: COURSE_CURRENCY,
    status: REWARD_STATUS.UNCREDITED,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }).select('*').single();

  if (error) throw error;
  return data;
}

async function updateReferralRewardStatus(rewardId, newStatus, adminNotes = null) {
  return await updateReferralRewardStatusAdmin({ rewardId, newStatus, adminEmail: 'admin@saturn.in' });
}

async function getAllReferralRewards() {
  const supabase = getClient();
  const { data } = await supabase.from('referral_rewards').select('*');
  return data || [];
}

function ensureDb() {
  return true;
}

async function ensureAdminAccount() {
  return await getMasterAdmin();
}

module.exports = {
  isConfigured,
  getClient,
  ensureDb,
  ensureAdminAccount,
  COURSE_ID,
  COURSE_NAME,
  COURSE_FEE,
  COURSE_CURRENCY,
  REFERRAL_REWARD_AMOUNT,
  REWARD_STATUS,
  hashPassword,
  verifyPassword,
  generateReceiptNumber,
  createStudent,
  authenticateStudent,
  findStudentByEmail,
  findStudentById,
  findStudentByReferralCode,
  ensureStudentReferralCode,
  getStudentEnrollment,
  getEnrollmentByOrderId,
  createOrUpdateEnrollment,
  markEnrollmentPaid,
  markEnrollmentFailed,
  isStudentPaid,
  getStudentPayments,
  getPaymentReceipt,
  validateReferralCode,
  createReferralRewardForEnrollment,
  getStudentReferrals,
  getStudentReferralSummary,
  updateReferralRewardStatus,
  getAllReferralRewards,
  createSession,
  getSession,
  deleteSession,
  getMasterAdmin,
  authenticateAdmin,
  createAdminSession,
  getAdminSession,
  deleteAdminSession,
  getAdminStats,
  getAdminStudents,
  getAdminStudentDetail,
  toggleStudentStatus,
  getAdminPayments,
  getAdminReferrals,
  updateReferralRewardStatusAdmin,
  getAdminMaterials,
  uploadAdminMaterial,
  updateAdminMaterial,
  replaceAdminMaterialFile,
  deleteAdminMaterial,
  changeAdminPassword,
  logAdminAction,
  getAdminAuditLogs,
  getCourseMaterials,
  getCourseMaterialFile,
  checkLoginRateLimit,
  recordFailedLoginAttempt,
  clearLoginRateLimit,
  RATE_LIMIT_MAX_ATTEMPTS,
  RATE_LIMIT_WINDOW_MS
};
