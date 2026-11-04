'use strict';
/**
 * Saturn Technologies - Master Administrator Serverless Endpoint
 * Handles:
 * - Admin authentication (Single master admin only, password verify, 24h token)
 * - Dashboard summary stats
 * - Student directory & status toggle
 * - Payment management & verified receipts
 * - Referral reward management & approval progression
 * - Course materials CRUD (protected online view)
 * - Admin password change & audit log retrieval
 */
const crypto = require('crypto');
const path = require('path');
const db = require('../src/db');
const { cfg } = require('../src/lib');

const MAX_BODY_BYTES = 20 * 1024 * 1024; // 20MB for PDF uploads
const siteUrl = (cfg && cfg.siteUrl) || 'https://websites-software-business-grow.vercel.app';

function send(res, status, payload, contentType = 'application/json; charset=utf-8') {
  res.statusCode = status;
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (typeof payload === 'string' || Buffer.isBuffer(payload)) {
    res.end(payload);
  } else {
    res.end(JSON.stringify(payload));
  }
}

async function extractAdminSession(req) {
  let token = null;
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (authHeader && String(authHeader).startsWith('Bearer ')) {
    token = String(authHeader).slice(7).trim();
  } else if (req.headers.cookie) {
    const match = req.headers.cookie.match(/(?:^|;\s*)saturn_admin_token=([^;]+)/);
    if (match) token = decodeURIComponent(match[1]);
  }

  if (!token) {
    const url = new URL(req.url, 'http://localhost');
    token = url.searchParams.get('admin_token') || url.searchParams.get('t');
  }

  if (!token) return { token: null, adminSession: null };
  const adminSession = await db.getAdminSession(token);
  return { token, adminSession };
}

function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return Promise.resolve(req.body);
  }
  if (typeof req.body === 'string') {
    try {
      return Promise.resolve(JSON.parse(req.body));
    } catch (e) {
      return Promise.reject(e);
    }
  }
  return new Promise((resolve, reject) => {
    let bytes = 0;
    const chunks = [];
    req.on('data', (c) => {
      bytes += c.length;
      if (bytes > MAX_BODY_BYTES) {
        const err = new Error('Request payload too large.');
        err.code = 413;
        reject(err);
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const host = (req.headers.host || '').toLowerCase();
  const allowed = ['localhost', '127.0.0.1', '0.0.0.0'];
  for (const a of allowed) {
    if (host.startsWith(a)) return true;
  }
  try {
    const u = new URL(origin);
    return u.host.toLowerCase() === host;
  } catch {
    return false;
  }
}

function getClientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (xf) return xf.split(',')[0].trim();
  return req.headers['x-real-ip'] || (req.socket && req.socket.remoteAddress) || '127.0.0.1';
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return send(res, 204, '');
  }

  if (!originAllowed(req)) {
    return send(res, 403, { ok: false, code: 'FORBIDDEN', message: 'Request origin not allowed.' });
  }

  // Parse body once for POST/PUT requests
  let body = {};
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    try {
      body = await readBody(req);
    } catch (err) {
      if (err.code === 413) {
        return send(res, 413, { ok: false, code: 'PAYLOAD_TOO_LARGE', message: 'Request payload too large.' });
      }
      return send(res, 400, { ok: false, code: 'INVALID_JSON', message: 'Malformed JSON payload.' });
    }
  }

  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname.replace(/\/+$/, '');
  const searchAction = url.searchParams.get('action');

  let action = body.action || searchAction || '';
  if (pathname.endsWith('/login')) action = 'login';
  else if (pathname.endsWith('/logout')) action = 'logout';
  else if (pathname.endsWith('/me') || pathname.endsWith('/verify')) action = 'verify';
  else if (pathname.endsWith('/stats')) action = 'stats';
  else if (pathname.endsWith('/students')) action = 'students';
  else if (pathname.endsWith('/payments')) action = 'payments';
  else if (pathname.endsWith('/referrals')) action = 'referrals';
  else if (pathname.endsWith('/materials')) action = 'materials';
  else if (pathname.endsWith('/settings')) action = 'settings';

  // ----------------------------------------------------
  // PUBLIC ACTION: Admin Login
  // ----------------------------------------------------
  if (action === 'login') {
    const email = String(body.email || url.searchParams.get('email') || '').trim();
    const password = String(body.password || url.searchParams.get('password') || '');

    if (!email || !password) {
      return send(res, 400, { ok: false, code: 'BAD_REQUEST', message: 'Email and password are required.' });
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

    const authResult = await db.authenticateAdmin(email, password);
    if (!authResult) {
      const attempt = await db.recordFailedLoginAttempt(ip, email);
      const remaining = Math.max(0, 5 - attempt.count);
      return send(res, 401, {
        ok: false,
        code: 'UNAUTHORIZED',
        message: remaining > 0
          ? `Invalid admin credentials. (${remaining} attempt${remaining === 1 ? '' : 's'} remaining)`
          : 'Invalid admin credentials. Too many failed attempts. Account temporarily locked for 15 minutes.'
      });
    }

    // Successful login: clear rate limit
    await db.clearLoginRateLimit(ip, email);

    // Set secure HTTP-only cookie + return token
    res.setHeader(
      'Set-Cookie',
      `saturn_admin_token=${encodeURIComponent(authResult.token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`
    );

    return send(res, 200, {
      ok: true,
      message: 'Admin authenticated successfully.',
      token: authResult.token,
      admin: authResult.admin
    });
  }

  // ----------------------------------------------------
  // SECURITY GUARD: All subsequent actions require Admin authentication
  // ----------------------------------------------------
  const { token, adminSession } = await extractAdminSession(req);
  if (!token || !adminSession) {
    return send(res, 401, {
      ok: false,
      code: 'UNAUTHORIZED',
      message: 'Administrative authorization required. Please log in as administrator.'
    });
  }

  const currentAdmin = adminSession.admin;

  // 1. VERIFY / ME
  if (action === 'verify' || action === 'me') {
    return send(res, 200, {
      ok: true,
      admin: currentAdmin
    });
  }

  // 2. LOGOUT
  if (action === 'logout') {
    await db.deleteAdminSession(token);
    res.setHeader(
      'Set-Cookie',
      `saturn_admin_token=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`
    );
    return send(res, 200, {
      ok: true,
      success: true,
      message: 'Admin logged out successfully.'
    });
  }

  // 3. DASHBOARD SUMMARY STATS
  if (action === 'stats') {
    const data = await db.getAdminStats();
    return send(res, 200, {
      ok: true,
      stats: {
        ...(data.stats || {}),
        totalRevenue: (data.stats && (data.stats.totalRevenue ?? data.stats.verifiedRevenue)) || 0,
        uncreditedRewards: (data.stats && (data.stats.uncreditedRewards ?? data.stats.rewardsAwaitingCredit)) || 0,
        creditedRewards: (data.stats && (data.stats.creditedRewards ?? data.stats.rewardsCredited)) || 0,
        recentStudents: data.recentStudents || [],
        recentPayments: data.recentPayments || [],
        recentReferrals: data.recentReferrals || []
      }
    });
  }

  // 4. STUDENT DIRECTORY & DETAIL
  if (action === 'students') {
    const search = body.search || url.searchParams.get('search') || '';
    const status = body.status || url.searchParams.get('status') || 'ALL';
    const students = await db.getAdminStudents({ search, status });
    return send(res, 200, {
      ok: true,
      students,
      totalCount: students.length
    });
  }

  if (action === 'student-detail') {
    const studentId = body.studentId || url.searchParams.get('id') || url.searchParams.get('student_id');
    if (!studentId) {
      return send(res, 400, { ok: false, code: 'BAD_REQUEST', message: 'Missing student ID.' });
    }
    const detail = await db.getAdminStudentDetail(studentId);
    if (!detail) {
      return send(res, 404, { ok: false, code: 'NOT_FOUND', message: 'Student not found.' });
    }
    return send(res, 200, { ok: true, ...detail });
  }

  if (action === 'toggle-student-status') {
    const studentId = body.studentId || url.searchParams.get('id');
    const targetActive = typeof body.active === 'boolean' ? body.active : undefined;
    if (!studentId) {
      return send(res, 400, { ok: false, code: 'BAD_REQUEST', message: 'Student ID is required.' });
    }
    try {
      const student = await db.toggleStudentStatus(studentId, currentAdmin.email, targetActive);
      return send(res, 200, {
        ok: true,
        active: student.active !== false,
        student,
        message: `Student status updated to ${student.active !== false ? 'ACTIVE' : 'INACTIVE'}.`
      });
    } catch (err) {
      return send(res, 400, { ok: false, message: err.message });
    }
  }

  // 5. PAYMENT MANAGEMENT & RECEIPTS
  if (action === 'payments') {
    const search = body.search || url.searchParams.get('search') || '';
    const status = body.status || url.searchParams.get('status') || 'ALL';
    const data = await db.getAdminPayments({ search, status });
    return send(res, 200, {
      ok: true,
      ...data
    });
  }

  if (action === 'receipt') {
    const paymentId = body.paymentId || url.searchParams.get('payment_id') || url.searchParams.get('id');
    const studentId = body.studentId || url.searchParams.get('student_id');
    if (!paymentId) {
      return send(res, 400, { ok: false, code: 'BAD_REQUEST', message: 'Missing payment_id parameter.' });
    }

    let targetStudentId = studentId;
    if (!targetStudentId) {
      const allPayments = (await db.getAdminPayments({ search: paymentId })).payments;
      const match = allPayments.find((p) => p.id === paymentId || p.orderId === paymentId || p.paymentId === paymentId || p.transactionId === paymentId);
      if (match) targetStudentId = match.studentId;
    }

    if (!targetStudentId) {
      return send(res, 404, { ok: false, code: 'NOT_FOUND', message: 'Payment record not found.' });
    }

    const receipt = await db.getPaymentReceipt({ studentId: targetStudentId, paymentId });
    if (!receipt) {
      return send(res, 404, { ok: false, code: 'NOT_FOUND', message: 'Payment record not found.' });
    }

    return send(res, 200, { ok: true, receipt });
  }

  // 6. REFERRAL MANAGEMENT
  if (action === 'referrals') {
    const search = body.search || url.searchParams.get('search') || '';
    const status = body.status || url.searchParams.get('status') || 'ALL';
    const referrals = await db.getAdminReferrals({ search, status });
    return send(res, 200, {
      ok: true,
      referrals,
      totalCount: referrals.length
    });
  }

  if (action === 'update-reward-status') {
    const rewardId = body.rewardId || body.referralId;
    const newStatus = body.status || body.newStatus;
    const notes = body.notes || '';

    if (!rewardId || !newStatus) {
      return send(res, 400, { ok: false, code: 'BAD_REQUEST', message: 'Reward ID and new status are required.' });
    }

    try {
      const reward = await db.updateReferralRewardStatusAdmin({
        rewardId,
        newStatus,
        notes,
        adminEmail: currentAdmin.email
      });
      return send(res, 200, {
        ok: true,
        referral: reward,
        reward,
        message: `Reward status successfully updated to "${newStatus}".`
      });
    } catch (err) {
      return send(res, 400, { ok: false, message: err.message });
    }
  }

  // 7. MATERIALS MANAGEMENT
  if (action === 'materials') {
    const materials = await db.getAdminMaterials();
    return send(res, 200, {
      ok: true,
      materials,
      totalCount: materials.length
    });
  }

  if (action === 'upload-material') {
    const title = String(body.title || '').trim();
    const category = String(body.category || 'Course Material').trim();
    const description = String(body.description || '').trim();
    const fileName = String(body.fileName || body.filename || 'document.pdf').trim();
    const pdfBase64 = body.pdfBase64 || body.fileData;

    if (!title) {
      return send(res, 400, { ok: false, code: 'BAD_REQUEST', message: 'Material title is required.' });
    }
    if (!pdfBase64) {
      return send(res, 400, { ok: false, code: 'BAD_REQUEST', message: 'PDF document file is required.' });
    }

    let pdfBuffer;
    try {
      const cleanBase64 = String(pdfBase64).replace(/^data:application\/pdf;base64,/, '');
      pdfBuffer = Buffer.from(cleanBase64, 'base64');
    } catch (_) {
      return send(res, 400, { ok: false, code: 'BAD_REQUEST', message: 'Invalid PDF base64 file data.' });
    }

    try {
      const newMaterial = await db.uploadAdminMaterial({
        title,
        category,
        description,
        fileName,
        pdfBuffer,
        adminEmail: currentAdmin.email
      });
      return send(res, 200, {
        ok: true,
        material: newMaterial,
        message: 'Course material uploaded successfully.'
      });
    } catch (err) {
      return send(res, 400, { ok: false, message: err.message });
    }
  }

  if (action === 'update-material') {
    const materialId = body.materialId;
    if (!materialId) {
      return send(res, 400, { ok: false, code: 'BAD_REQUEST', message: 'Material ID is required.' });
    }

    try {
      const updated = await db.updateAdminMaterial({
        materialId,
        title: body.title,
        category: body.category,
        description: body.description,
        order: body.order,
        active: body.active,
        adminEmail: currentAdmin.email
      });
      return send(res, 200, {
        ok: true,
        material: updated,
        message: 'Material details updated successfully.'
      });
    } catch (err) {
      return send(res, 400, { ok: false, message: err.message });
    }
  }

  if (action === 'replace-material') {
    const materialId = body.materialId;
    const fileName = body.fileName || body.filename;
    const pdfBase64 = body.pdfBase64 || body.fileData;

    if (!materialId || !pdfBase64) {
      return send(res, 400, { ok: false, code: 'BAD_REQUEST', message: 'Material ID and PDF file are required.' });
    }

    let pdfBuffer;
    try {
      const cleanBase64 = String(pdfBase64).replace(/^data:application\/pdf;base64,/, '');
      pdfBuffer = Buffer.from(cleanBase64, 'base64');
    } catch (_) {
      return send(res, 400, { ok: false, code: 'BAD_REQUEST', message: 'Invalid PDF file encoding.' });
    }

    try {
      const replaced = await db.replaceAdminMaterialFile({
        materialId,
        fileName,
        pdfBuffer,
        adminEmail: currentAdmin.email
      });
      return send(res, 200, {
        ok: true,
        material: replaced,
        message: 'Course PDF replaced successfully.'
      });
    } catch (err) {
      return send(res, 400, { ok: false, message: err.message });
    }
  }

  if (action === 'delete-material') {
    const materialId = body.materialId || url.searchParams.get('id');
    if (!materialId) {
      return send(res, 400, { ok: false, code: 'BAD_REQUEST', message: 'Material ID is required.' });
    }

    try {
      await db.deleteAdminMaterial(materialId, currentAdmin.email);
      return send(res, 200, {
        ok: true,
        success: true,
        message: 'Course material deleted successfully.'
      });
    } catch (err) {
      return send(res, 400, { ok: false, message: err.message });
    }
  }

  // 8. PREVIEW MATERIAL (STREAM PROTECTED PDF)
  if (action === 'preview-material') {
    const materialId = body.materialId || url.searchParams.get('materialId') || url.searchParams.get('id');
    if (!materialId) {
      return send(res, 400, { ok: false, message: 'Missing materialId parameter.' });
    }

    const materialFile = await db.getCourseMaterialFile(materialId);
    if (!materialFile || !materialFile.buffer) {
      return send(res, 404, { ok: false, message: 'Course document file not found.' });
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', materialFile.buffer.length);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Content-Disposition', 'inline; filename="preview.pdf"');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.end(materialFile.buffer);
  }

  // 9. ADMIN SETTINGS & AUDIT LOGS
  if (action === 'change-password') {
    const currentPassword = String(body.currentPassword || '');
    const newPassword = String(body.newPassword || '');

    if (!currentPassword || !newPassword) {
      return send(res, 400, { ok: false, code: 'BAD_REQUEST', message: 'Current password and new password are required.' });
    }

    try {
      await db.changeAdminPassword({
        adminId: currentAdmin.id,
        currentPassword,
        newPassword
      });
      return send(res, 200, {
        ok: true,
        success: true,
        message: 'Admin password changed successfully.'
      });
    } catch (err) {
      const status = err.code === 'INVALID_PASSWORD' ? 401 : 400;
      return send(res, status, { ok: false, message: err.message });
    }
  }

  if (action === 'audit-logs') {
    const logs = await db.getAdminAuditLogs(50);
    return send(res, 200, { ok: true, logs });
  }

  return send(res, 404, { ok: false, code: 'NOT_FOUND', message: `Unknown admin action: ${action}` });
};
