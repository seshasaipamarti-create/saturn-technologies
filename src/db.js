'use strict';
/**
 * Simple file-based database for students, sessions, course enrollments, and payments.
 * Follows the project's zero-dependency standard using Node.js built-ins.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const DATA_DIR = path.join(root, 'data');
const STUDENTS_FILE = path.join(DATA_DIR, 'students.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const ENROLLMENTS_FILE = path.join(DATA_DIR, 'enrollments.json');
const PAYMENTS_FILE = path.join(DATA_DIR, 'payments.json');
const REWARDS_FILE = path.join(DATA_DIR, 'referral_rewards.json');
const MATERIALS_FILE = path.join(DATA_DIR, 'materials.json');
const MATERIALS_DIR = path.join(DATA_DIR, 'materials');
const ADMIN_FILE = path.join(DATA_DIR, 'admin.json');
const ADMIN_SESSIONS_FILE = path.join(DATA_DIR, 'admin_sessions.json');
const ADMIN_AUDIT_FILE = path.join(DATA_DIR, 'admin_audit.json');
const RATE_LIMIT_FILE = path.join(DATA_DIR, 'rate_limits.json');

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

let isEnsuringDb = false;
function ensureDb() {
  if (isEnsuringDb) return;
  isEnsuringDb = true;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(STUDENTS_FILE)) {
      fs.writeFileSync(STUDENTS_FILE, JSON.stringify([], null, 2), 'utf8');
    }
    if (!fs.existsSync(SESSIONS_FILE)) {
      fs.writeFileSync(SESSIONS_FILE, JSON.stringify([], null, 2), 'utf8');
    }
    if (!fs.existsSync(ENROLLMENTS_FILE)) {
      fs.writeFileSync(ENROLLMENTS_FILE, JSON.stringify([], null, 2), 'utf8');
    }
    if (!fs.existsSync(PAYMENTS_FILE)) {
      fs.writeFileSync(PAYMENTS_FILE, JSON.stringify([], null, 2), 'utf8');
    }
    if (!fs.existsSync(REWARDS_FILE)) {
      fs.writeFileSync(REWARDS_FILE, JSON.stringify([], null, 2), 'utf8');
    }
    if (!fs.existsSync(MATERIALS_DIR) || !fs.existsSync(MATERIALS_FILE)) {
      try {
        require('../scripts/generate-materials').generateAllMaterials();
      } catch (_) {}
    }
    if (!fs.existsSync(ADMIN_SESSIONS_FILE)) {
      fs.writeFileSync(ADMIN_SESSIONS_FILE, JSON.stringify([], null, 2), 'utf8');
    }
    if (!fs.existsSync(ADMIN_AUDIT_FILE)) {
      fs.writeFileSync(ADMIN_AUDIT_FILE, JSON.stringify([], null, 2), 'utf8');
    }
    if (!fs.existsSync(RATE_LIMIT_FILE)) {
      fs.writeFileSync(RATE_LIMIT_FILE, JSON.stringify([], null, 2), 'utf8');
    }
    ensureAdminAccount();
  } finally {
    isEnsuringDb = false;
  }
}

function readJson(file) {
  ensureDb();
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw || '[]');
  } catch {
    return [];
  }
}

function writeJson(file, data) {
  ensureDb();
  const tmp = `${file}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(storedHash, password) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, key] = storedHash.split(':');
  const keyBuffer = Buffer.from(key, 'hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(keyBuffer, derivedKey);
}

function generateUniqueReferralCode(email) {
  const students = readJson(STUDENTS_FILE);
  const existingCodes = new Set(students.map((s) => s.referralCode).filter(Boolean));
  const cleanPrefix = String(email || '').split('@')[0].replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'STUD';
  let attempts = 0;
  while (attempts < 100) {
    const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
    const candidate = `SATURN-${cleanPrefix}-${rand}`;
    if (!existingCodes.has(candidate)) {
      return candidate;
    }
    attempts++;
  }
  return `SATURN-${cleanPrefix}-${Date.now().toString(36).toUpperCase()}`;
}

function generateReferralCode(email) {
  return generateUniqueReferralCode(email);
}

function findStudentByEmail(email) {
  if (!email) return null;
  const students = readJson(STUDENTS_FILE);
  const normalized = String(email).trim().toLowerCase();
  return students.find((s) => s.email && s.email.toLowerCase() === normalized) || null;
}

function findStudentById(id) {
  if (!id) return null;
  const students = readJson(STUDENTS_FILE);
  return students.find((s) => s.id === id) || null;
}

function findStudentByReferralCode(code) {
  if (!code) return null;
  const students = readJson(STUDENTS_FILE);
  const normalized = String(code).trim().toUpperCase();
  const student = students.find((s) => s.referralCode && s.referralCode.toUpperCase() === normalized);
  if (!student) return null;
  // Ensure the referrer has actually completed course payment
  if (!isStudentPaid(student.id)) return null;
  return student;
}

function ensureStudentReferralCode(student) {
  if (!student) return null;
  // Rule: Students who have not successfully completed course payment must not receive active referral codes
  if (!isStudentPaid(student.id)) {
    return null;
  }
  if (student.referralCode) return student.referralCode;

  const students = readJson(STUDENTS_FILE);
  const idx = students.findIndex((s) => s.id === student.id);
  if (idx > -1) {
    const code = generateUniqueReferralCode(student.email);
    students[idx].referralCode = code;
    writeJson(STUDENTS_FILE, students);
    student.referralCode = code;
    return code;
  }
  return null;
}

function createStudent({ email, contactNumber, collegeName, academicYear, degree, password }) {
  ensureDb();
  const normalizedEmail = String(email).trim().toLowerCase();
  const students = readJson(STUDENTS_FILE);

  if (students.some((s) => s.email && s.email.toLowerCase() === normalizedEmail)) {
    const err = new Error('This email address is already registered. Please log in.');
    err.code = 'EMAIL_EXISTS';
    throw err;
  }

  // Rule: Do not generate referral codes for unpaid students
  const student = {
    id: 'stu_' + crypto.randomBytes(8).toString('hex'),
    email: normalizedEmail,
    contactNumber: String(contactNumber).trim(),
    collegeName: String(collegeName).trim(),
    academicYear: String(academicYear).trim(),
    degree: String(degree).trim(),
    referralCode: null,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString()
  };

  students.push(student);
  writeJson(STUDENTS_FILE, students);

  return {
    id: student.id,
    email: student.email,
    contactNumber: student.contactNumber,
    collegeName: student.collegeName,
    academicYear: student.academicYear,
    degree: student.degree,
    referralCode: student.referralCode,
    createdAt: student.createdAt
  };
}

function authenticateStudent(email, password) {
  const student = findStudentByEmail(email);
  if (!student) return null;
  if (!verifyPassword(student.passwordHash, password)) return null;

  if (student.status === 'INACTIVE' || student.active === false) {
    const err = new Error('Your student account has been deactivated. Please contact administration for assistance.');
    err.code = 'ACCOUNT_DEACTIVATED';
    throw err;
  }

  ensureStudentReferralCode(student);

  return {
    id: student.id,
    email: student.email,
    contactNumber: student.contactNumber,
    collegeName: student.collegeName,
    academicYear: student.academicYear,
    degree: student.degree,
    referralCode: student.referralCode
  };
}

function createSession(studentId) {
  ensureDb();
  const token = crypto.randomBytes(32).toString('hex');
  const sessions = readJson(SESSIONS_FILE);
  const now = Date.now();
  const expiresAt = now + 7 * 24 * 3600 * 1000; // 7 days

  const activeSessions = sessions.filter((s) => s.expiresAt > now);
  activeSessions.push({
    token,
    studentId,
    createdAt: now,
    expiresAt
  });

  writeJson(SESSIONS_FILE, activeSessions);
  return { token, expiresAt };
}

function getSession(token) {
  if (!token) return null;
  ensureDb();
  const sessions = readJson(SESSIONS_FILE);
  const now = Date.now();
  const session = sessions.find((s) => s.token === token && s.expiresAt > now);
  if (!session) return null;

  const student = findStudentById(session.studentId);
  if (!student) return null;

  ensureStudentReferralCode(student);

  return {
    session,
    student: {
      id: student.id,
      email: student.email,
      contactNumber: student.contactNumber,
      collegeName: student.collegeName,
      academicYear: student.academicYear,
      degree: student.degree,
      referralCode: student.referralCode
    }
  };
}

function deleteSession(token) {
  if (!token) return;
  ensureDb();
  const sessions = readJson(SESSIONS_FILE);
  const filtered = sessions.filter((s) => s.token !== token);
  writeJson(SESSIONS_FILE, filtered);
}

// ----------------------------------------------------
// ENROLLMENT & PAYMENT FUNCTIONS
// ----------------------------------------------------

function getStudentEnrollment(studentId) {
  if (!studentId) return null;
  const enrollments = readJson(ENROLLMENTS_FILE);
  return enrollments.find((e) => e.studentId === studentId && e.courseId === COURSE_ID) || null;
}

function isStudentPaid(studentId) {
  const enrollment = getStudentEnrollment(studentId);
  return Boolean(enrollment && enrollment.status === 'PAID');
}

function getEnrollmentByOrderId(orderId) {
  if (!orderId) return null;
  const enrollments = readJson(ENROLLMENTS_FILE);
  return enrollments.find((e) => e.cashfreeOrderId === orderId) || null;
}

/**
 * Validates an optional referral code:
 * - Must belong to another student (cannot use their own code)
 * - That other student must have completed course payment (eligible paid student)
 */
function validateReferralCode(code, currentStudentId) {
  if (!code || typeof code !== 'string') {
    return { valid: false, message: 'Referral code cannot be empty.' };
  }
  const cleanCode = code.trim().toUpperCase();
  const referrer = findStudentByReferralCode(cleanCode);

  if (!referrer) {
    return { valid: false, message: 'Invalid referral code. Please check and try again.' };
  }

  if (referrer.id === currentStudentId) {
    return { valid: false, message: 'You cannot use your own referral code.' };
  }

  const isReferrerPaid = isStudentPaid(referrer.id);
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

function createOrUpdateEnrollment({ studentId, referralCodeUsed, orderId }) {
  ensureDb();
  const enrollments = readJson(ENROLLMENTS_FILE);
  const existing = enrollments.find((e) => e.studentId === studentId && e.courseId === COURSE_ID);

  if (existing && existing.status === 'PAID') {
    const err = new Error('Student is already enrolled and paid for this course.');
    err.code = 'ALREADY_PAID';
    throw err;
  }

  const now = new Date().toISOString();

  if (existing) {
    existing.cashfreeOrderId = orderId;
    if (referralCodeUsed) existing.referralCodeUsed = referralCodeUsed.trim().toUpperCase();
    existing.updatedAt = now;
    writeJson(ENROLLMENTS_FILE, enrollments);
    return existing;
  }

  const enrollment = {
    id: 'enr_' + crypto.randomBytes(8).toString('hex'),
    studentId,
    courseId: COURSE_ID,
    courseName: COURSE_NAME,
    amount: COURSE_FEE,
    currency: COURSE_CURRENCY,
    status: 'PENDING',
    referralCodeUsed: referralCodeUsed ? referralCodeUsed.trim().toUpperCase() : null,
    cashfreeOrderId: orderId,
    cashfreePaymentId: null,
    paymentMethod: null,
    paymentTimestamp: null,
    createdAt: now,
    updatedAt: now
  };

  enrollments.push(enrollment);
  writeJson(ENROLLMENTS_FILE, enrollments);
  return enrollment;
}

function markEnrollmentPaid({ orderId, cfPaymentId, paymentMethod, paymentTimestamp, rawDetails = {} }) {
  ensureDb();
  const enrollments = readJson(ENROLLMENTS_FILE);
  const enrollment = enrollments.find((e) => e.cashfreeOrderId === orderId);

  if (!enrollment) {
    const err = new Error(`No enrollment found for order ID: ${orderId}`);
    err.code = 'ENROLLMENT_NOT_FOUND';
    throw err;
  }

  const now = new Date().toISOString();

  // Idempotency: if already paid, return safely without creating duplicate payment record
  if (enrollment.status === 'PAID') {
    return enrollment;
  }

  enrollment.status = 'PAID';
  enrollment.cashfreePaymentId = cfPaymentId || `cf_sim_${crypto.randomBytes(6).toString('hex')}`;
  enrollment.paymentMethod = paymentMethod || 'ONLINE';
  enrollment.paymentTimestamp = paymentTimestamp || now;
  enrollment.updatedAt = now;

  writeJson(ENROLLMENTS_FILE, enrollments);

  // 1. Ensure newly paid student receives their active unique referral code
  const student = findStudentById(enrollment.studentId);
  if (student) {
    ensureStudentReferralCode(student);
  }

  // 2. Save payment record
  const payments = readJson(PAYMENTS_FILE);
  const receiptNumber = generateReceiptNumber(orderId, enrollment.id);
  const paymentRecord = {
    id: 'pay_' + crypto.randomBytes(8).toString('hex'),
    receiptNumber,
    enrollmentId: enrollment.id,
    studentId: enrollment.studentId,
    courseName: enrollment.courseName || COURSE_NAME,
    orderId,
    cfPaymentId: enrollment.cashfreePaymentId,
    amount: enrollment.amount,
    currency: enrollment.currency,
    status: 'PAID',
    method: enrollment.paymentMethod,
    rawDetails,
    timestamp: enrollment.paymentTimestamp
  };

  payments.push(paymentRecord);
  writeJson(PAYMENTS_FILE, payments);

  // 3. Create ₹1,000 referral reward for referring student (if a valid referral code was used)
  if (enrollment.referralCodeUsed) {
    createReferralRewardForEnrollment(enrollment);
  }

  return enrollment;
}

function generateReceiptNumber(orderId, paymentId) {
  const seed = String(orderId || paymentId || '').replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase();
  return `SATURN-REC-2026-${seed || '0001'}`;
}

function markEnrollmentFailed({ orderId, rawDetails = {} }) {
  ensureDb();
  const enrollments = readJson(ENROLLMENTS_FILE);
  const enrollment = enrollments.find((e) => e.cashfreeOrderId === orderId);
  if (!enrollment || enrollment.status === 'PAID') return enrollment;

  const now = new Date().toISOString();
  enrollment.status = 'FAILED';
  enrollment.updatedAt = now;
  writeJson(ENROLLMENTS_FILE, enrollments);

  // Save failed transaction record for payment history
  const payments = readJson(PAYMENTS_FILE);
  const existingPay = payments.find((p) => p.orderId === orderId);
  if (!existingPay) {
    payments.push({
      id: 'pay_' + crypto.randomBytes(8).toString('hex'),
      receiptNumber: null,
      enrollmentId: enrollment.id,
      studentId: enrollment.studentId,
      courseName: enrollment.courseName || COURSE_NAME,
      orderId,
      cfPaymentId: null,
      amount: enrollment.amount,
      currency: enrollment.currency,
      status: 'FAILED',
      method: null,
      rawDetails,
      timestamp: now
    });
    writeJson(PAYMENTS_FILE, payments);
  }

  return enrollment;
}

function getStudentPayments(studentId) {
  if (!studentId) return [];
  ensureDb();
  const payments = readJson(PAYMENTS_FILE);
  const enrollments = readJson(ENROLLMENTS_FILE);

  const studentPayments = payments
    .filter((p) => p.studentId === studentId)
    .map((p) => ({
      ...p,
      courseName: p.courseName || COURSE_NAME,
      receiptNumber: p.status === 'PAID' ? (p.receiptNumber || generateReceiptNumber(p.orderId, p.id)) : null
    }));

  // Surface any pending enrollment attempt not yet in payments.json
  const enrollment = enrollments.find((e) => e.studentId === studentId && e.courseId === COURSE_ID);
  if (enrollment && enrollment.cashfreeOrderId) {
    const hasRecord = studentPayments.some((p) => p.orderId === enrollment.cashfreeOrderId);
    if (!hasRecord && (enrollment.status === 'PENDING' || enrollment.status === 'FAILED')) {
      studentPayments.push({
        id: 'att_' + enrollment.id.slice(4),
        receiptNumber: null,
        enrollmentId: enrollment.id,
        studentId: enrollment.studentId,
        courseName: enrollment.courseName || COURSE_NAME,
        orderId: enrollment.cashfreeOrderId,
        cfPaymentId: enrollment.cashfreePaymentId || null,
        amount: enrollment.amount,
        currency: enrollment.currency,
        status: enrollment.status,
        method: enrollment.paymentMethod || 'Pending',
        timestamp: enrollment.updatedAt || enrollment.createdAt
      });
    }
  }

  // Sort descending by timestamp: latest payment is always first!
  return studentPayments.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

function getPaymentReceipt({ studentId, paymentId }) {
  if (!studentId || !paymentId) return null;
  ensureDb();
  const payments = getStudentPayments(studentId);
  const payment = payments.find((p) => p.id === paymentId || p.orderId === paymentId);
  if (!payment) return null;

  // Strict Security Rule: Only successfully completed payments generate receipts
  if (payment.status !== 'PAID') {
    return {
      eligible: false,
      status: payment.status,
      message: 'Payment receipts are only generated for successfully verified payments.'
    };
  }

  const student = findStudentById(studentId);

  return {
    eligible: true,
    receiptNumber: payment.receiptNumber || generateReceiptNumber(payment.orderId, payment.id),
    paymentId: payment.id,
    orderId: payment.orderId,
    cfPaymentId: payment.cfPaymentId,
    courseName: payment.courseName || COURSE_NAME,
    amount: payment.amount || COURSE_FEE,
    currency: payment.currency || COURSE_CURRENCY,
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
// REFERRAL & REWARD FUNCTIONS (FEATURE 2)
// ----------------------------------------------------

function maskEmail(email) {
  if (!email || typeof email !== 'string') return '';
  const parts = email.split('@');
  if (parts.length !== 2) return email;
  const name = parts[0];
  const domain = parts[1];
  if (name.length <= 2) {
    return name[0] + '***@' + domain;
  }
  return name[0] + '***' + name[name.length - 1] + '@' + domain;
}

function createReferralRewardForEnrollment(enrollment) {
  if (!enrollment || !enrollment.referralCodeUsed) return null;
  ensureDb();

  const rewards = readJson(REWARDS_FILE);
  // Idempotency: Prevent multiple referral claims for the same enrollment
  const existing = rewards.find((r) => r.enrollmentId === enrollment.id);
  if (existing) {
    return existing;
  }

  const referrer = findStudentByReferralCode(enrollment.referralCodeUsed);
  if (!referrer) {
    return null;
  }

  // Prevent self-referrals
  if (referrer.id === enrollment.studentId) {
    return null;
  }

  // Verify referrer is an eligible paid student
  if (!isStudentPaid(referrer.id)) {
    return null;
  }

  const referredStudent = findStudentById(enrollment.studentId);
  const now = new Date().toISOString();

  const reward = {
    id: 'rew_' + crypto.randomBytes(8).toString('hex'),
    referrerStudentId: referrer.id,
    referredStudentId: enrollment.studentId,
    referredStudentEmail: referredStudent ? referredStudent.email : null,
    referredStudentDegree: referredStudent ? referredStudent.degree : null,
    referredStudentCollege: referredStudent ? referredStudent.collegeName : null,
    enrollmentId: enrollment.id,
    orderId: enrollment.cashfreeOrderId,
    referralCode: enrollment.referralCodeUsed,
    rewardAmount: REFERRAL_REWARD_AMOUNT,
    currency: 'INR',
    status: REWARD_STATUS.UNCREDITED, // Initial status: strictly MONEY UNCREDITED
    createdAt: now,
    updatedAt: now,
    creditedAt: null,
    adminNotes: null
  };

  rewards.push(reward);
  writeJson(REWARDS_FILE, rewards);
  return reward;
}

function getStudentReferrals(studentId) {
  if (!studentId) return [];
  ensureDb();
  const rewards = readJson(REWARDS_FILE);
  return rewards
    .filter((r) => r.referrerStudentId === studentId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function getStudentReferralSummary(studentId) {
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

  ensureDb();
  const student = findStudentById(studentId);
  const isPaid = isStudentPaid(studentId);
  const referralCode = isPaid ? ensureStudentReferralCode(student) : null;

  const rewards = readJson(REWARDS_FILE);
  const studentRewards = rewards
    .filter((r) => r.referrerStudentId === studentId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const totalSuccessfulReferrals = studentRewards.length;
  const totalReferralRewards = studentRewards.reduce((sum, r) => sum + (Number(r.rewardAmount) || 0), 0);

  // Strictly enforce: ONLY REFERRAL SUCCESSFULLY CREDITED contributes to withdrawableBalance
  const withdrawableBalance = studentRewards
    .filter((r) => r.status === REWARD_STATUS.CREDITED)
    .reduce((sum, r) => sum + (Number(r.rewardAmount) || 0), 0);

  const uncreditedRewards = studentRewards
    .filter((r) => r.status === REWARD_STATUS.UNCREDITED)
    .reduce((sum, r) => sum + (Number(r.rewardAmount) || 0), 0);

  const inProcessRewards = studentRewards
    .filter((r) => r.status === REWARD_STATUS.IN_PROCESS)
    .reduce((sum, r) => sum + (Number(r.rewardAmount) || 0), 0);

  const history = studentRewards.map((r) => {
    const masked = maskEmail(r.referredStudentEmail);
    const identifier = masked || `Student #${r.referredStudentId.slice(-6).toUpperCase()}`;
    return {
      id: r.id,
      referredIdentifier: identifier,
      referredDegree: r.referredStudentDegree || '',
      referredCollege: r.referredStudentCollege || '',
      date: r.createdAt,
      rewardAmount: r.rewardAmount,
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

function updateReferralRewardStatus(rewardId, newStatus, adminNotes = null) {
  ensureDb();
  const validStatuses = Object.values(REWARD_STATUS);
  if (!validStatuses.includes(newStatus)) {
    throw new Error(`Invalid reward status: ${newStatus}. Allowed: ${validStatuses.join(', ')}`);
  }

  const rewards = readJson(REWARDS_FILE);
  const reward = rewards.find((r) => r.id === rewardId);
  if (!reward) {
    throw new Error(`Reward not found: ${rewardId}`);
  }

  reward.status = newStatus;
  reward.updatedAt = new Date().toISOString();
  if (adminNotes) reward.adminNotes = adminNotes;
  if (newStatus === REWARD_STATUS.CREDITED && !reward.creditedAt) {
    reward.creditedAt = reward.updatedAt;
  }

  writeJson(REWARDS_FILE, rewards);
  return reward;
}

function getAllReferralRewards() {
  ensureDb();
  return readJson(REWARDS_FILE);
}

// ----------------------------------------------------
// MATERIALS & ONLINE PDF VIEWER (FEATURE 3)
// ----------------------------------------------------

/**
 * Retrieves the catalog of study materials for the enrolled course.
 * Strict access control: only students with verified successful course payment can access.
 */
function getCourseMaterials({ studentId, courseId = COURSE_ID }) {
  if (!studentId) {
    return { ok: false, status: 401, error: 'UNAUTHENTICATED', message: 'You must be logged in to access course materials.' };
  }
  ensureDb();

  const student = findStudentById(studentId);
  if (!student) {
    return { ok: false, status: 401, error: 'STUDENT_NOT_FOUND', message: 'Student account not found.' };
  }

  // Access Control: Only paid students can access materials
  if (!isStudentPaid(studentId)) {
    return {
      ok: false,
      status: 403,
      error: 'PAYMENT_REQUIRED',
      message: 'Course materials are only accessible to enrolled students who have completed payment.'
    };
  }

  const allMaterials = readJson(MATERIALS_FILE);
  const courseMaterials = allMaterials
    .filter((m) => m.courseId === courseId && m.active !== false)
    .map((m) => ({
      id: m.id,
      courseId: m.courseId,
      title: m.title,
      category: m.category,
      description: m.description,
      fileSize: m.fileSize,
      pageCount: m.pageCount,
      updatedAt: m.updatedAt
    }));

  return {
    ok: true,
    status: 200,
    courseName: COURSE_NAME,
    materials: courseMaterials
  };
}

/**
 * Retrieves the binary stream / buffer for a specific course PDF.
 * Strict access control: verifies student authorization and payment status before returning file content.
 */
function getCourseMaterialFile({ studentId, materialId }) {
  if (!studentId) {
    return { ok: false, status: 401, error: 'UNAUTHENTICATED', message: 'Authentication required.' };
  }
  if (!materialId) {
    return { ok: false, status: 400, error: 'MISSING_ID', message: 'Material ID is required.' };
  }

  ensureDb();

  const student = findStudentById(studentId);
  if (!student) {
    return { ok: false, status: 401, error: 'STUDENT_NOT_FOUND', message: 'Student account not found.' };
  }

  // Access Control: Unpaid, pending, or failed students are strictly rejected
  if (!isStudentPaid(studentId)) {
    return {
      ok: false,
      status: 403,
      error: 'PAYMENT_REQUIRED',
      message: 'Access denied. You must have completed course payment to access learning materials.'
    };
  }

  const allMaterials = readJson(MATERIALS_FILE);
  const material = allMaterials.find((m) => m.id === materialId);
  if (!material) {
    return { ok: false, status: 404, error: 'NOT_FOUND', message: 'The requested course material was not found.' };
  }

  const safePath = path.normalize(path.join(MATERIALS_DIR, material.fileName));
  if (!safePath.startsWith(MATERIALS_DIR)) {
    return { ok: false, status: 403, error: 'ACCESS_DENIED', message: 'Invalid file path request.' };
  }

  if (!fs.existsSync(safePath)) {
    return { ok: false, status: 404, error: 'FILE_NOT_FOUND', message: 'Material file is currently unavailable.' };
  }

  const buffer = fs.readFileSync(safePath);
  return {
    ok: true,
    status: 200,
    material: {
      id: material.id,
      title: material.title,
      category: material.category,
      fileName: material.fileName,
      pageCount: material.pageCount
    },
    buffer,
    contentType: 'application/pdf',
    size: buffer.length
  };
}

// ----------------------------------------------------
// ADMIN AUTHENTICATION & MANAGEMENT (FEATURE: ADMIN PANEL)
// ----------------------------------------------------

function ensureAdminAccount() {
  if (!fs.existsSync(ADMIN_FILE)) {
    const defaultEmail = (process.env.ADMIN_EMAIL || 'admin@saturn.in').trim().toLowerCase();
    const defaultPass = process.env.ADMIN_PASSWORD || 'SaturnAdmin2026!';
    const initialAdmin = {
      id: 'adm_master_001',
      email: defaultEmail,
      role: 'SUPER_ADMIN',
      passwordHash: hashPassword(defaultPass),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(ADMIN_FILE, JSON.stringify([initialAdmin], null, 2), 'utf8');
  }
}

function getMasterAdmin() {
  ensureDb();
  const admins = readJson(ADMIN_FILE);
  return admins.length > 0 ? admins[0] : null;
}

function authenticateAdmin(email, password) {
  if (!email || !password) return null;
  ensureDb();
  const admin = getMasterAdmin();
  if (!admin) return null;

  const normalized = String(email).trim().toLowerCase();
  if (admin.email.toLowerCase() !== normalized) {
    logAdminAction({
      action: 'ADMIN_LOGIN_FAILED',
      details: { attemptedEmail: normalized, reason: 'Invalid email' }
    });
    return null;
  }

  if (!verifyPassword(admin.passwordHash, password)) {
    logAdminAction({
      action: 'ADMIN_LOGIN_FAILED',
      details: { attemptedEmail: normalized, reason: 'Invalid password' }
    });
    return null;
  }

  // Create 24-hour admin session
  const token = 'adm_sess_' + crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
  const sessions = readJson(ADMIN_SESSIONS_FILE);
  sessions.push({
    token,
    adminId: admin.id,
    email: admin.email,
    role: admin.role,
    createdAt: new Date().toISOString(),
    expiresAt
  });
  writeJson(ADMIN_SESSIONS_FILE, sessions);

  logAdminAction({
    action: 'ADMIN_LOGIN_SUCCESS',
    details: { email: admin.email },
    adminEmail: admin.email
  });

  return {
    token,
    admin: {
      id: admin.id,
      email: admin.email,
      role: admin.role
    }
  };
}

function getAdminSession(token) {
  if (!token) return null;
  ensureDb();
  const sessions = readJson(ADMIN_SESSIONS_FILE);
  const now = Date.now();
  const session = sessions.find((s) => s.token === token && s.expiresAt > now);
  if (!session) return null;

  const admin = getMasterAdmin();
  if (!admin || admin.id !== session.adminId) return null;

  return {
    session,
    admin: {
      id: admin.id,
      email: admin.email,
      role: admin.role
    }
  };
}

function deleteAdminSession(token) {
  if (!token) return;
  ensureDb();
  const sessions = readJson(ADMIN_SESSIONS_FILE);
  const filtered = sessions.filter((s) => s.token !== token);
  writeJson(ADMIN_SESSIONS_FILE, filtered);
}

function changeAdminPassword({ adminId, currentPassword, newPassword }) {
  ensureDb();
  const admin = getMasterAdmin();
  if (!admin || admin.id !== adminId) {
    const err = new Error('Admin account not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  if (!verifyPassword(admin.passwordHash, currentPassword)) {
    const err = new Error('Current password is incorrect.');
    err.code = 'INVALID_PASSWORD';
    throw err;
  }

  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
    const err = new Error('New password must be at least 8 characters long.');
    err.code = 'WEAK_PASSWORD';
    throw err;
  }

  admin.passwordHash = hashPassword(newPassword);
  admin.updatedAt = new Date().toISOString();
  writeJson(ADMIN_FILE, [admin]);

  // Security requirement: Invalidate all existing admin sessions upon password change
  writeJson(ADMIN_SESSIONS_FILE, []);

  logAdminAction({
    action: 'ADMIN_PASSWORD_CHANGED',
    details: { adminId: admin.id },
    adminEmail: admin.email
  });

  return true;
}

function getAdminStats() {
  ensureDb();
  const students = readJson(STUDENTS_FILE);
  const enrollments = readJson(ENROLLMENTS_FILE);
  const payments = readJson(PAYMENTS_FILE);
  const rewards = readJson(REWARDS_FILE);

  const totalStudents = students.length;
  const paidStudents = students.filter((s) => isStudentPaid(s.id)).length;

  // Accurately deduplicate failed and pending payment attempts by order ID
  const allOrderIds = new Set();
  let failedPayments = 0;
  let pendingPayments = 0;

  // Payments are primary records of completed/failed transactions
  payments.forEach((p) => {
    if (p.orderId) allOrderIds.add(p.orderId);
    if (p.status === 'FAILED') failedPayments++;
    else if (p.status === 'PENDING') pendingPayments++;
  });

  // Include enrollment attempts not already recorded in payments
  enrollments.forEach((e) => {
    if (e.cashfreeOrderId && !allOrderIds.has(e.cashfreeOrderId)) {
      if (e.status === 'FAILED') failedPayments++;
      else if (e.status === 'PENDING') pendingPayments++;
    }
  });

  const verifiedPayments = payments.filter((p) => p.status === 'PAID');
  const verifiedRevenue = verifiedPayments.reduce((sum, p) => sum + (Number(p.amount) || COURSE_FEE), 0);

  const totalReferrals = rewards.length;
  const rewardsAwaitingCredit = rewards.filter(
    (r) => r.status === REWARD_STATUS.UNCREDITED || r.status === REWARD_STATUS.IN_PROCESS
  ).length;
  const rewardsCredited = rewards.filter((r) => r.status === REWARD_STATUS.CREDITED).length;

  // Recent lists
  const recentStudents = [...students]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5)
    .map((s) => ({
      id: s.id,
      email: s.email,
      degree: s.degree,
      collegeName: s.collegeName,
      createdAt: s.createdAt,
      isPaid: isStudentPaid(s.id),
      status: s.status || 'ACTIVE'
    }));

  const recentPayments = [...payments]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 5)
    .map((p) => {
      const student = findStudentById(p.studentId);
      return {
        id: p.id,
        orderId: p.orderId,
        studentEmail: student ? student.email : 'Unknown',
        amount: p.amount || COURSE_FEE,
        status: p.status,
        timestamp: p.timestamp,
        method: p.method || 'Online'
      };
    });

  const recentReferrals = [...rewards]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5)
    .map((r) => {
      const referrer = findStudentById(r.referrerStudentId);
      const referred = findStudentById(r.referredStudentId);
      return {
        id: r.id,
        referrerEmail: referrer ? referrer.email : 'Unknown',
        referredEmail: referred ? referred.email : 'Unknown',
        referralCode: r.referralCode,
        rewardAmount: r.rewardAmount || REFERRAL_REWARD_AMOUNT,
        status: r.status,
        createdAt: r.createdAt
      };
    });

  return {
    stats: {
      totalStudents,
      paidStudents,
      pendingPayments,
      failedPayments,
      verifiedRevenue,
      totalReferrals,
      rewardsAwaitingCredit,
      rewardsCredited
    },
    recentStudents,
    recentPayments,
    recentReferrals
  };
}

function getAdminStudents({ search = '', status = 'ALL' } = {}) {
  ensureDb();
  const students = readJson(STUDENTS_FILE);
  const q = String(search || '').trim().toLowerCase();

  return students
    .map((s) => {
      const isPaid = isStudentPaid(s.id);
      const enrollment = getStudentEnrollment(s.id);
      const payments = getStudentPayments(s.id);
      const referrals = getStudentReferrals(s.id);
      const name = s.fullName || s.name || (s.email ? s.email.split('@')[0] : 'Student');
      return {
        id: s.id,
        name,
        fullName: name,
        email: s.email,
        phone: s.contactNumber || s.phone || '',
        contactNumber: s.contactNumber || s.phone || '',
        college: s.collegeName || s.college || '',
        collegeName: s.collegeName || s.college || '',
        academicYear: s.academicYear,
        degree: s.degree,
        referralCode: s.referralCode,
        createdAt: s.createdAt,
        status: s.status || 'ACTIVE',
        active: s.status !== 'INACTIVE' && s.active !== false,
        paid: isPaid,
        isPaid,
        enrollmentStatus: enrollment ? enrollment.status : 'NOT_ENROLLED',
        paymentsCount: payments.length,
        referralsCount: referrals.length
      };
    })
    .filter((s) => {
      if (status === 'PAID' && !s.isPaid) return false;
      if (status === 'UNPAID' && s.isPaid) return false;
      if (status === 'ACTIVE' && s.status !== 'ACTIVE') return false;
      if (status === 'INACTIVE' && s.status !== 'INACTIVE') return false;
      if (!q) return true;
      return (
        s.email.toLowerCase().includes(q) ||
        (s.contactNumber && s.contactNumber.toLowerCase().includes(q)) ||
        (s.collegeName && s.collegeName.toLowerCase().includes(q)) ||
        (s.degree && s.degree.toLowerCase().includes(q)) ||
        (s.referralCode && s.referralCode.toLowerCase().includes(q))
      );
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function getAdminStudentDetail(studentId) {
  ensureDb();
  const student = findStudentById(studentId);
  if (!student) return null;

  const isPaid = isStudentPaid(student.id);
  const enrollment = getStudentEnrollment(student.id);
  const payments = getStudentPayments(student.id);
  const referrals = getStudentReferrals(student.id);
  const referralSummary = getStudentReferralSummary(student.id);

  return {
    student: {
      id: student.id,
      email: student.email,
      contactNumber: student.contactNumber,
      collegeName: student.collegeName,
      academicYear: student.academicYear,
      degree: student.degree,
      referralCode: student.referralCode,
      createdAt: student.createdAt,
      status: student.status || 'ACTIVE',
      isPaid
    },
    enrollment,
    payments,
    referrals,
    referralSummary
  };
}

function toggleStudentStatus(studentId, adminEmail = 'admin@saturn.in', targetActive = undefined) {
  ensureDb();
  const students = readJson(STUDENTS_FILE);
  const idx = students.findIndex((s) => s.id === studentId);
  if (idx === -1) {
    const err = new Error('Student not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const student = students[idx];
  let nextStatus;
  if (typeof targetActive === 'boolean') {
    nextStatus = targetActive ? 'ACTIVE' : 'INACTIVE';
  } else {
    nextStatus = (student.status === 'INACTIVE' || student.active === false) ? 'ACTIVE' : 'INACTIVE';
  }
  student.status = nextStatus;
  student.active = nextStatus === 'ACTIVE';
  student.updatedAt = new Date().toISOString();
  writeJson(STUDENTS_FILE, students);

  // If student was deactivated, revoke active student sessions
  if (nextStatus === 'INACTIVE') {
    const sessions = readJson(SESSIONS_FILE);
    const active = sessions.filter((s) => s.studentId !== studentId);
    writeJson(SESSIONS_FILE, active);
  }

  logAdminAction({
    action: 'STUDENT_STATUS_TOGGLED',
    details: { studentId, email: student.email, newStatus: nextStatus, active: student.active },
    adminEmail
  });

  return student;
}

function getAdminPayments({ search = '', status = 'ALL' } = {}) {
  ensureDb();
  const payments = readJson(PAYMENTS_FILE);
  const enrollments = readJson(ENROLLMENTS_FILE);
  const students = readJson(STUDENTS_FILE);
  const q = String(search || '').trim().toLowerCase();

  const allRecords = payments.map((p) => {
    const student = students.find((s) => s.id === p.studentId);
    return {
      id: p.id,
      orderId: p.orderId,
      cfPaymentId: p.cfPaymentId || null,
      receiptNumber: p.status === 'PAID' ? (p.receiptNumber || generateReceiptNumber(p.orderId, p.id)) : null,
      studentId: p.studentId,
      studentEmail: student ? student.email : 'Unknown',
      studentPhone: student ? student.contactNumber : '',
      studentCollege: student ? student.collegeName : '',
      studentDegree: student ? student.degree : '',
      courseName: p.courseName || COURSE_NAME,
      amount: p.amount || COURSE_FEE,
      currency: p.currency || COURSE_CURRENCY,
      status: p.status,
      method: p.method || 'Online',
      timestamp: p.timestamp
    };
  });

  // Attach pending enrollment attempts not yet in payments.json
  enrollments.forEach((e) => {
    if (e.cashfreeOrderId && !allRecords.some((p) => p.orderId === e.cashfreeOrderId)) {
      const student = students.find((s) => s.id === e.studentId);
      allRecords.push({
        id: 'att_' + e.id.slice(4),
        orderId: e.cashfreeOrderId,
        cfPaymentId: null,
        receiptNumber: null,
        studentId: e.studentId,
        studentEmail: student ? student.email : 'Unknown',
        studentPhone: student ? student.contactNumber : '',
        studentCollege: student ? student.collegeName : '',
        studentDegree: student ? student.degree : '',
        courseName: e.courseName || COURSE_NAME,
        amount: e.amount || COURSE_FEE,
        currency: e.currency || COURSE_CURRENCY,
        status: e.status || 'PENDING',
        method: 'Pending Attempt',
        timestamp: e.updatedAt || e.createdAt
      });
    }
  });

  const filtered = allRecords
    .filter((p) => {
      if (status !== 'ALL' && p.status !== status) return false;
      if (!q) return true;
      return (
        p.studentEmail.toLowerCase().includes(q) ||
        (p.orderId && p.orderId.toLowerCase().includes(q)) ||
        (p.cfPaymentId && p.cfPaymentId.toLowerCase().includes(q)) ||
        (p.receiptNumber && p.receiptNumber.toLowerCase().includes(q))
      );
    })
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const totalRevenue = allRecords
    .filter((p) => p.status === 'PAID')
    .reduce((sum, p) => sum + (Number(p.amount) || COURSE_FEE), 0);

  return {
    payments: filtered,
    totalRevenue,
    totalCount: filtered.length
  };
}

function getAdminReferrals({ search = '', status = 'ALL' } = {}) {
  ensureDb();
  const rewards = readJson(REWARDS_FILE);
  const students = readJson(STUDENTS_FILE);
  const q = String(search || '').trim().toLowerCase();

  return rewards
    .map((r) => {
      const referrer = students.find((s) => s.id === r.referrerStudentId);
      const referred = students.find((s) => s.id === r.referredStudentId);
      const isReferredPaid = isStudentPaid(r.referredStudentId);
      return {
        id: r.id,
        enrollmentId: r.enrollmentId,
        orderId: r.orderId,
        referralCode: r.referralCode,
        rewardAmount: r.rewardAmount || REFERRAL_REWARD_AMOUNT,
        currency: r.currency || COURSE_CURRENCY,
        status: r.status,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        creditedAt: r.creditedAt || null,
        isReferredPaid,
        referrer: referrer
          ? { id: referrer.id, email: referrer.email, phone: referrer.contactNumber, referralCode: referrer.referralCode }
          : null,
        referred: referred
          ? { id: referred.id, email: referred.email, phone: referred.contactNumber, college: referred.collegeName }
          : null
      };
    })
    .filter((r) => {
      if (status !== 'ALL' && r.status !== status) return false;
      if (!q) return true;
      const refEmail = r.referrer ? r.referrer.email.toLowerCase() : '';
      const refCode = r.referralCode ? r.referralCode.toLowerCase() : '';
      const rdEmail = r.referred ? r.referred.email.toLowerCase() : '';
      return refEmail.includes(q) || refCode.includes(q) || rdEmail.includes(q);
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function updateReferralRewardStatusAdmin({ rewardId, newStatus, adminEmail = 'admin@saturn.in' }) {
  ensureDb();
  const validStatuses = Object.values(REWARD_STATUS);
  if (!validStatuses.includes(newStatus)) {
    const err = new Error(`Invalid reward status. Must be one of: ${validStatuses.join(', ')}`);
    err.code = 'INVALID_STATUS';
    throw err;
  }

  const rewards = readJson(REWARDS_FILE);
  const reward = rewards.find((r) => r.id === rewardId);
  if (!reward) {
    const err = new Error('Referral reward record not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  // Security check: Only eligible if referred student has completed verified payment
  if (!isStudentPaid(reward.referredStudentId)) {
    const err = new Error('Cannot update reward status: Referred student has not completed verified course payment.');
    err.code = 'PAYMENT_NOT_VERIFIED';
    throw err;
  }

  const oldStatus = reward.status;
  reward.status = newStatus;
  reward.rewardStatus = newStatus;
  reward.updatedAt = new Date().toISOString();
  if (newStatus === REWARD_STATUS.CREDITED && !reward.creditedAt) {
    reward.creditedAt = reward.updatedAt;
  }

  writeJson(REWARDS_FILE, rewards);

  logAdminAction({
    action: 'REFERRAL_REWARD_STATUS_UPDATED',
    details: { rewardId, referralCode: reward.referralCode, oldStatus, newStatus },
    adminEmail
  });

  return reward;
}

function getAdminMaterials() {
  ensureDb();
  const materials = readJson(MATERIALS_FILE);
  return materials.map((m) => {
    const filePath = path.join(MATERIALS_DIR, m.fileName);
    return {
      ...m,
      fileExists: fs.existsSync(filePath),
      active: m.active !== false
    };
  });
}

function uploadAdminMaterial({ title, category, description, fileName, pdfBuffer, adminEmail = 'admin@saturn.in' }) {
  if (!title || !title.trim()) {
    throw new Error('Material title is required.');
  }
  if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0) {
    throw new Error('A valid PDF file buffer is required.');
  }

  // Verify PDF header magic bytes
  const header = pdfBuffer.slice(0, 8).toString('utf8');
  if (!header.startsWith('%PDF-')) {
    throw new Error('Invalid file format. Document must be a genuine PDF file (%PDF-).');
  }

  if (pdfBuffer.length > 15 * 1024 * 1024) {
    throw new Error('File size exceeds the 15MB limit.');
  }

  ensureDb();
  const safeName = (fileName || 'document.pdf')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .toLowerCase();
  const ext = path.extname(safeName) || '.pdf';
  const base = path.basename(safeName, ext);
  const targetFileName = `${base}_${Date.now()}${ext}`;
  const targetPath = path.join(MATERIALS_DIR, targetFileName);

  fs.writeFileSync(targetPath, pdfBuffer);

  // Estimate page count
  const pdfString = pdfBuffer.toString('binary');
  const countMatches = pdfString.match(/\/Type\s*\/Page[^s]/g);
  const pageCount = countMatches ? countMatches.length : 1;

  const materials = readJson(MATERIALS_FILE);
  const newMaterial = {
    id: 'mat_' + crypto.randomBytes(6).toString('hex'),
    courseId: COURSE_ID,
    title: title.trim(),
    category: (category || 'Course Material').trim(),
    description: (description || '').trim(),
    fileName: targetFileName,
    fileSize: Math.round(pdfBuffer.length / 1024) + ' KB',
    pageCount,
    order: materials.length + 1,
    active: true,
    updatedAt: new Date().toISOString()
  };

  materials.push(newMaterial);
  writeJson(MATERIALS_FILE, materials);

  logAdminAction({
    action: 'MATERIAL_UPLOADED',
    details: { id: newMaterial.id, title: newMaterial.title, fileName: targetFileName },
    adminEmail
  });

  return newMaterial;
}

function updateAdminMaterial({ materialId, title, category, description, order, active, adminEmail = 'admin@saturn.in' }) {
  ensureDb();
  const materials = readJson(MATERIALS_FILE);
  const material = materials.find((m) => m.id === materialId);
  if (!material) {
    throw new Error('Material record not found.');
  }

  if (title) material.title = title.trim();
  if (category) material.category = category.trim();
  if (description !== undefined) material.description = description.trim();
  if (order !== undefined) material.order = Number(order) || 1;
  if (active !== undefined) material.active = Boolean(active);
  material.updatedAt = new Date().toISOString();

  writeJson(MATERIALS_FILE, materials);

  logAdminAction({
    action: 'MATERIAL_UPDATED',
    details: { materialId, title: material.title, active: material.active },
    adminEmail
  });

  return material;
}

function replaceAdminMaterialFile({ materialId, fileName, pdfBuffer, adminEmail = 'admin@saturn.in' }) {
  if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0) {
    throw new Error('A valid PDF file buffer is required.');
  }
  const header = pdfBuffer.slice(0, 8).toString('utf8');
  if (!header.startsWith('%PDF-')) {
    throw new Error('Invalid file format. Only valid PDF files are permitted.');
  }

  ensureDb();
  const materials = readJson(MATERIALS_FILE);
  const material = materials.find((m) => m.id === materialId);
  if (!material) {
    throw new Error('Material record not found.');
  }

  const oldPath = path.join(MATERIALS_DIR, material.fileName);
  if (fs.existsSync(oldPath)) {
    try { fs.unlinkSync(oldPath); } catch (_) {}
  }

  const safeName = (fileName || material.fileName || 'document.pdf')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .toLowerCase();
  const ext = path.extname(safeName) || '.pdf';
  const targetFileName = `${path.basename(safeName, ext)}_${Date.now()}${ext}`;
  const targetPath = path.join(MATERIALS_DIR, targetFileName);

  fs.writeFileSync(targetPath, pdfBuffer);

  const pdfString = pdfBuffer.toString('binary');
  const countMatches = pdfString.match(/\/Type\s*\/Page[^s]/g);
  const pageCount = countMatches ? countMatches.length : 1;

  material.fileName = targetFileName;
  material.fileSize = Math.round(pdfBuffer.length / 1024) + ' KB';
  material.pageCount = pageCount;
  material.updatedAt = new Date().toISOString();

  writeJson(MATERIALS_FILE, materials);

  logAdminAction({
    action: 'MATERIAL_FILE_REPLACED',
    details: { materialId, fileName: targetFileName },
    adminEmail
  });

  return material;
}

function deleteAdminMaterial(materialId, adminEmail = 'admin@saturn.in') {
  ensureDb();
  const materials = readJson(MATERIALS_FILE);
  const idx = materials.findIndex((m) => m.id === materialId);
  if (idx === -1) {
    throw new Error('Material record not found.');
  }

  const material = materials[idx];
  const targetPath = path.join(MATERIALS_DIR, material.fileName);
  if (fs.existsSync(targetPath)) {
    try { fs.unlinkSync(targetPath); } catch (_) {}
  }

  materials.splice(idx, 1);
  writeJson(MATERIALS_FILE, materials);

  logAdminAction({
    action: 'MATERIAL_DELETED',
    details: { materialId, title: material.title },
    adminEmail
  });

  return true;
}

function logAdminAction({ action, details = {}, adminEmail = 'admin@saturn.in' }) {
  ensureDb();
  const logs = readJson(ADMIN_AUDIT_FILE);
  const entry = {
    id: 'aud_' + crypto.randomBytes(6).toString('hex'),
    action,
    details,
    adminEmail,
    timestamp: new Date().toISOString()
  };
  logs.unshift(entry);
  if (logs.length > 300) logs.length = 300;
  writeJson(ADMIN_AUDIT_FILE, logs);
  return entry;
}

function getAdminAuditLogs(limit = 50) {
  ensureDb();
  const logs = readJson(ADMIN_AUDIT_FILE);
  return logs.slice(0, Math.min(limit, 100));
}

// ----------------------------------------------------
// LOGIN RATE LIMITING (SHARED PERSISTENT SECURITY CONTROL)
// ----------------------------------------------------
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX_ATTEMPTS = 5;

function checkLoginRateLimit(ip, email) {
  ensureDb();
  const cleanIp = String(ip || '127.0.0.1').trim();
  const cleanEmail = String(email || '').trim().toLowerCase();
  const key = `${cleanIp}:${cleanEmail}`;
  const now = Date.now();

  const limits = readJson(RATE_LIMIT_FILE);
  const record = limits.find((r) => r.key === key);

  if (record) {
    // If window expired, allow attempt
    if (now - record.firstAttemptAt > RATE_LIMIT_WINDOW_MS) {
      return { allowed: true, remaining: RATE_LIMIT_MAX_ATTEMPTS };
    }
    if (record.attempts >= RATE_LIMIT_MAX_ATTEMPTS) {
      const waitSeconds = Math.max(1, Math.ceil((record.firstAttemptAt + RATE_LIMIT_WINDOW_MS - now) / 1000));
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

function recordFailedLoginAttempt(ip, email) {
  ensureDb();
  const cleanIp = String(ip || '127.0.0.1').trim();
  const cleanEmail = String(email || '').trim().toLowerCase();
  const key = `${cleanIp}:${cleanEmail}`;
  const now = Date.now();

  let limits = readJson(RATE_LIMIT_FILE);
  // Clean up expired entries across all keys to prevent file bloat
  limits = limits.filter((r) => now - r.firstAttemptAt <= RATE_LIMIT_WINDOW_MS);

  let record = limits.find((r) => r.key === key);
  if (!record) {
    record = { key, attempts: 1, firstAttemptAt: now, lastAttemptAt: now };
    limits.push(record);
  } else {
    if (now - record.firstAttemptAt > RATE_LIMIT_WINDOW_MS) {
      record.attempts = 1;
      record.firstAttemptAt = now;
      record.lastAttemptAt = now;
    } else {
      record.attempts += 1;
      record.lastAttemptAt = now;
    }
  }
  writeJson(RATE_LIMIT_FILE, limits);
  return {
    attempts: record.attempts,
    count: record.attempts,
    remaining: Math.max(0, RATE_LIMIT_MAX_ATTEMPTS - record.attempts)
  };
}

function clearLoginRateLimit(ip, email) {
  ensureDb();
  const cleanIp = String(ip || '127.0.0.1').trim();
  const cleanEmail = String(email || '').trim().toLowerCase();
  const key = `${cleanIp}:${cleanEmail}`;

  let limits = readJson(RATE_LIMIT_FILE);
  const filtered = limits.filter((r) => r.key !== key);
  if (filtered.length !== limits.length) {
    writeJson(RATE_LIMIT_FILE, filtered);
  }
}

const localDb = {
  ensureDb,
  createStudent,
  authenticateStudent,
  findStudentByEmail,
  findStudentById,
  findStudentByReferralCode,
  ensureStudentReferralCode,
  createSession,
  getSession,
  deleteSession,
  hashPassword,
  verifyPassword,
  COURSE_ID,
  COURSE_NAME,
  COURSE_FEE,
  COURSE_CURRENCY,
  REFERRAL_REWARD_AMOUNT,
  REWARD_STATUS,
  getStudentEnrollment,
  isStudentPaid,
  getEnrollmentByOrderId,
  validateReferralCode,
  createOrUpdateEnrollment,
  markEnrollmentPaid,
  markEnrollmentFailed,
  getStudentPayments,
  generateReceiptNumber,
  getPaymentReceipt,
  createReferralRewardForEnrollment,
  getStudentReferrals,
  getStudentReferralSummary,
  updateReferralRewardStatus,
  getAllReferralRewards,
  getCourseMaterials,
  getCourseMaterialFile,
  // Admin module exports
  ensureAdminAccount,
  getMasterAdmin,
  authenticateAdmin,
  getAdminSession,
  deleteAdminSession,
  changeAdminPassword,
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
  logAdminAction,
  getAdminAuditLogs,
  // Rate limiting exports
  checkLoginRateLimit,
  recordFailedLoginAttempt,
  clearLoginRateLimit,
  RATE_LIMIT_MAX_ATTEMPTS,
  RATE_LIMIT_WINDOW_MS
};

let envLoaded = false;
function loadLocalEnv() {
  if (envLoaded) return;
  envLoaded = true;
  try {
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
}

function isLocalOverrideAllowed() {
  const isVercel = Boolean(process.env.VERCEL && String(process.env.VERCEL).trim());
  const isProduction = process.env.NODE_ENV === 'production';
  if (isVercel || isProduction) {
    return false;
  }
  return Boolean(process.env.FORCE_LOCAL_DB === '1' || process.env.USE_LOCAL_JSON === '1');
}

function getActiveDatabase() {
  if (isLocalOverrideAllowed()) {
    return localDb;
  }
  loadLocalEnv();
  const hasUrl = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_URL.trim());
  const hasKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY.trim());

  if (hasUrl || hasKey) {
    if (!hasUrl || !hasKey) {
      throw new Error('Incomplete Supabase configuration: both SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be provided.');
    }
    return require('./db-supabase');
  }

  return localDb;
}

// Transparent Proxy Dispatcher: routes dynamically to Supabase in production or local JSON in development
const dbDispatcher = new Proxy(localDb, {
  get(target, prop) {
    if (prop === '__isSupabase') {
      if (isLocalOverrideAllowed()) {
        return false;
      }
      loadLocalEnv();
      const hasUrl = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_URL.trim());
      const hasKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY.trim());
      return Boolean(hasUrl && hasKey);
    }
    const activeDb = getActiveDatabase();
    if (prop in activeDb) {
      return activeDb[prop];
    }
    if (prop in target) {
      return target[prop];
    }
    return undefined;
  },
  has(target, prop) {
    const activeDb = getActiveDatabase();
    return prop in activeDb || prop in target;
  },
  ownKeys(target) {
    const activeDb = getActiveDatabase();
    return Array.from(new Set([...Reflect.ownKeys(target), ...Reflect.ownKeys(activeDb)]));
  },
  getOwnPropertyDescriptor(target, prop) {
    const activeDb = getActiveDatabase();
    if (prop in activeDb) {
      return Reflect.getOwnPropertyDescriptor(activeDb, prop) || {
        value: activeDb[prop],
        writable: true,
        enumerable: true,
        configurable: true
      };
    }
    return Reflect.getOwnPropertyDescriptor(target, prop);
  }
});

module.exports = dbDispatcher;
