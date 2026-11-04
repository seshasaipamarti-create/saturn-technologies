'use strict';
/**
 * Saturn Technologies - Master Administrator Portal Client Controller
 * Zero-dependency native browser JavaScript for Admin Dashboard & Authentication
 */

(function() {
  const TOKEN_KEY = 'saturn_admin_token';

  // Helper: Get token
  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY) || '';
    } catch (_) {
      return '';
    }
  }

  function setToken(token) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch (_) {}
  }

  // API Client with automatic Authorization header
  async function adminApi(action, data = {}) {
    const token = getToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const res = await fetch('/api/admin', {
      method: 'POST',
      headers,
      body: JSON.stringify({ action, ...data })
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(json.message || json.error || 'Server error occurred (' + res.status + ')');
      err.status = res.status;
      err.code = json.code;
      err.data = json;
      throw err;
    }
    return json;
  }

  // Utility: Escape HTML
  function esc(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Utility: Format Date
  function fmtDate(isoStr) {
    if (!isoStr) return '—';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return String(isoStr);
      return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (_) {
      return String(isoStr);
    }
  }

  // Utility: Format Currency
  function fmtInr(amt) {
    const n = Number(amt) || 0;
    return '₹' + n.toLocaleString('en-IN');
  }

  // Utility: Status badge HTML
  function statusBadge(status, type = 'payment') {
    const s = String(status || '').toUpperCase();
    if (type === 'payment') {
      if (s === 'SUCCESSFUL') return '<span class="badge ok">SUCCESSFUL</span>';
      if (s === 'PENDING') return '<span class="badge warn">PENDING</span>';
      return '<span class="badge danger">' + esc(s || 'FAILED') + '</span>';
    }
    if (type === 'reward') {
      if (s === 'REFERRAL SUCCESSFULLY CREDITED') return '<span class="badge ok">CREDITED</span>';
      if (s === 'REFERRAL CLAIM IN PROCESS') return '<span class="badge warn">IN PROCESS</span>';
      return '<span class="badge">UNCREDITED</span>';
    }
    if (type === 'account') {
      if (s === 'INACTIVE' || status === false) return '<span class="badge danger">DEACTIVATED</span>';
      return '<span class="badge ok">ACTIVE</span>';
    }
    return '<span class="badge">' + esc(s) + '</span>';
  }

  // ==========================================
  // 1. ADMIN LOGIN PAGE LOGIC
  // ==========================================
  function initAdminLogin() {
    const form = document.getElementById('admin-login-form');
    if (!form) return;

    // Check if already authenticated
    const existingToken = getToken();
    if (existingToken) {
      adminApi('verify')
        .then(() => { window.location.replace('/admin/dashboard'); })
        .catch(() => { setToken(null); });
    }

    const emailInput = document.getElementById('admin-email');
    const passInput = document.getElementById('admin-password');
    const submitBtn = document.getElementById('admin-login-submit');
    const statusDiv = document.getElementById('admin-login-status');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = emailInput.value.trim();
      const password = passInput.value;

      if (!email || !password) {
        statusDiv.className = 'form-status error';
        statusDiv.textContent = 'Please enter both admin email and password.';
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Verifying Credentials…';
      statusDiv.className = 'form-status';
      statusDiv.textContent = '';

      try {
        const res = await adminApi('login', { email, password });
        if (res.token) setToken(res.token);

        statusDiv.className = 'form-status ok';
        statusDiv.textContent = 'Login successful. Redirecting to Admin Dashboard…';
        setTimeout(() => {
          window.location.replace('/admin/dashboard');
        }, 300);
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Sign In to Admin Portal →';
        statusDiv.className = 'form-status error';
        statusDiv.textContent = err.message || 'Invalid administrator credentials.';
      }
    });
  }

  // ==========================================
  // 2. ADMIN DASHBOARD PAGE LOGIC
  // ==========================================
  let currentAdminData = null;
  let allStudents = [];
  let allPayments = [];
  let allReferrals = [];
  let allMaterials = [];
  let currentStudentFilter = 'ALL';
  let currentPaymentFilter = 'ALL';
  let currentReferralFilter = 'ALL';

  async function initAdminDashboard() {
    const mainPanel = document.getElementById('admin-main-panel');
    if (!mainPanel) return;

    // Verify authentication
    try {
      const authRes = await adminApi('verify');
      currentAdminData = authRes.admin;
      const emailEl = document.getElementById('admin-sidebar-email');
      if (emailEl && currentAdminData) emailEl.textContent = currentAdminData.email;
      const settEmail = document.getElementById('admin-settings-email');
      if (settEmail && currentAdminData) settEmail.textContent = currentAdminData.email;
      const settLogin = document.getElementById('admin-settings-last-login');
      if (settLogin && currentAdminData && currentAdminData.lastLogin) settLogin.textContent = fmtDate(currentAdminData.lastLogin);
    } catch (err) {
      setToken(null);
      window.location.replace('/admin/login');
      return;
    }

    // Setup navigation tabs
    setupNavigation();

    // Setup view controllers
    setupDashboardView();
    setupStudentsView();
    setupPaymentsView();
    setupReferralsView();
    setupMaterialsView();
    setupSettingsView();
    setupReceiptModal();

    // Refresh button
    const refreshBtn = document.getElementById('btn-admin-refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        loadAllData(true);
      });
    }

    // Logout button
    const logoutBtn = document.getElementById('btn-admin-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        try {
          await adminApi('logout');
        } catch (_) {}
        setToken(null);
        window.location.replace('/admin/login');
      });
    }

    // Initial load of all data
    loadAllData();
  }

  // Navigation controller
  function setupNavigation() {
    const navItems = document.querySelectorAll('.admin-nav-item[data-view]');
    const views = document.querySelectorAll('.admin-view-panel');
    const viewTitle = document.getElementById('admin-view-title');
    const viewSub = document.getElementById('admin-view-sub');

    const titles = {
      dashboard: ['Dashboard Overview', 'Real-time operations, revenue metrics, and system analytics.'],
      students: ['Student Directory', 'View registered students, verified enrollments, and payment history.'],
      payments: ['Payment Transactions', 'Monitor all Cashfree transactions, order IDs, and official tax receipts.'],
      referrals: ['Referral Management', 'Track referral performance, claims, and approve ₹1,000 reward credits.'],
      materials: ['Course Materials', 'Manage protected PDF reading documents for enrolled students.'],
      settings: ['Admin Settings & Security', 'Master admin account security, password updates, and audit trail.']
    };

    function showView(viewName) {
      navItems.forEach(item => {
        if (item.getAttribute('data-view') === viewName) item.classList.add('active');
        else item.classList.remove('active');
      });

      views.forEach(v => {
        if (v.id === 'view-admin-' + viewName) {
          v.classList.add('active');
          v.hidden = false;
        } else {
          v.classList.remove('active');
          v.hidden = true;
        }
      });

      if (titles[viewName]) {
        if (viewTitle) viewTitle.textContent = titles[viewName][0];
        if (viewSub) viewSub.textContent = titles[viewName][1];
      }

      try {
        history.replaceState(null, '', '#' + viewName);
      } catch (_) {}
    }

    navItems.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetView = btn.getAttribute('data-view');
        showView(targetView);
      });
    });

    // Quick links with data-goto
    document.addEventListener('click', (e) => {
      const gotoBtn = e.target.closest('[data-goto]');
      if (gotoBtn) {
        const target = gotoBtn.getAttribute('data-goto');
        showView(target);
      }
    });

    // Handle hash on page load
    const hash = window.location.hash.replace('#', '');
    if (hash && titles[hash]) {
      showView(hash);
    }
  }

  // Load all admin data
  async function loadAllData(force = false) {
    try {
      await Promise.all([
        loadStats(),
        loadStudents(),
        loadPayments(),
        loadReferrals(),
        loadMaterials(),
        loadAuditLogs()
      ]);
    } catch (err) {
      console.error('Error loading admin data:', err);
    }
  }

  // ==========================================
  // VIEW: DASHBOARD STATS & RECENT TABLES
  // ==========================================
  async function loadStats() {
    const res = await adminApi('stats');
    const s = res.stats || {};

    const elTotalStudents = document.getElementById('stat-total-students');
    const elPaidStudents = document.getElementById('stat-paid-students');
    const elPendingPayments = document.getElementById('stat-pending-payments');
    const elFailedPayments = document.getElementById('stat-failed-payments');
    const elVerifiedRevenue = document.getElementById('stat-verified-revenue');
    const elTotalReferrals = document.getElementById('stat-total-referrals');
    const elUncreditedRewards = document.getElementById('stat-uncredited-rewards');
    const elCreditedRewards = document.getElementById('stat-credited-rewards');

    if (elTotalStudents) elTotalStudents.textContent = s.totalStudents || 0;
    if (elPaidStudents) elPaidStudents.textContent = s.paidStudents || 0;
    if (elPendingPayments) elPendingPayments.textContent = s.pendingPayments || 0;
    if (elFailedPayments) elFailedPayments.textContent = s.failedPayments || 0;
    if (elVerifiedRevenue) elVerifiedRevenue.textContent = fmtInr(s.totalRevenue || 0);
    if (elTotalReferrals) elTotalReferrals.textContent = s.totalReferrals || 0;
    if (elUncreditedRewards) elUncreditedRewards.textContent = s.uncreditedRewards || 0;
    if (elCreditedRewards) elCreditedRewards.textContent = s.creditedRewards || 0;

    renderRecentTables(s);
  }

  function renderRecentTables(s) {
    // Recent students
    const tbodyStudents = document.querySelector('#table-recent-students tbody');
    if (tbodyStudents) {
      const rec = s.recentStudents || [];
      if (!rec.length) {
        tbodyStudents.innerHTML = '<tr><td colspan="5" class="table-empty">No student registrations recorded yet.</td></tr>';
      } else {
        tbodyStudents.innerHTML = rec.map(st => `
          <tr>
            <td><strong>${esc(st.name || '—')}</strong></td>
            <td>${esc(st.email || '—')}</td>
            <td>${esc(st.college || '—')}</td>
            <td>${fmtDate(st.createdAt)}</td>
            <td>${st.paid ? '<span class="badge ok">Paid</span>' : '<span class="badge">Unpaid</span>'}</td>
          </tr>
        `).join('');
      }
    }

    // Recent payments
    const tbodyPayments = document.querySelector('#table-recent-payments tbody');
    if (tbodyPayments) {
      const rec = s.recentPayments || [];
      if (!rec.length) {
        tbodyPayments.innerHTML = '<tr><td colspan="5" class="table-empty">No payment transactions found.</td></tr>';
      } else {
        tbodyPayments.innerHTML = rec.map(p => `
          <tr>
            <td>
              <strong>${esc(p.studentName || 'Student')}</strong><br>
              <small class="fine">${esc(p.studentEmail || '—')}</small>
            </td>
            <td><strong>${fmtInr(p.amount || 5000)}</strong></td>
            <td><code>${esc(p.transactionId || p.paymentId || p.orderId || '—')}</code></td>
            <td>${fmtDate(p.createdAt || p.paidAt)}</td>
            <td>${statusBadge(p.status, 'payment')}</td>
          </tr>
        `).join('');
      }
    }

    // Recent referrals
    const tbodyReferrals = document.querySelector('#table-recent-referrals tbody');
    if (tbodyReferrals) {
      const rec = s.recentReferrals || [];
      if (!rec.length) {
        tbodyReferrals.innerHTML = '<tr><td colspan="5" class="table-empty">No referral activities recorded yet.</td></tr>';
      } else {
        tbodyReferrals.innerHTML = rec.map(r => `
          <tr>
            <td>
              <strong>${esc(r.referrerName || 'Referrer')}</strong><br>
              <small class="fine">${esc(r.referrerEmail || '—')}</small>
            </td>
            <td>
              <strong>${esc(r.referredStudentName || 'Student')}</strong><br>
              <small class="fine">${esc(r.referredStudentEmail || '—')}</small>
            </td>
            <td><strong>${fmtInr(r.rewardAmount || 1000)}</strong></td>
            <td>${statusBadge(r.rewardStatus, 'reward')}</td>
            <td>${fmtDate(r.createdAt)}</td>
          </tr>
        `).join('');
      }
    }
  }

  function setupDashboardView() {}

  // ==========================================
  // VIEW: STUDENTS DIRECTORY
  // ==========================================
  async function loadStudents() {
    const res = await adminApi('students');
    allStudents = res.students || [];
    renderStudentsTable();
  }

  function renderStudentsTable() {
    const tbody = document.getElementById('tbody-admin-students');
    const badge = document.getElementById('students-count-badge');
    const searchVal = (document.getElementById('students-search')?.value || '').toLowerCase().trim();

    const filtered = allStudents.filter(st => {
      // Filter status
      if (currentStudentFilter === 'PAID' && !st.paid) return false;
      if (currentStudentFilter === 'UNPAID' && st.paid) return false;
      if (currentStudentFilter === 'ACTIVE' && st.active === false) return false;
      if (currentStudentFilter === 'INACTIVE' && st.active !== false) return false;

      // Search match
      if (searchVal) {
        const text = [st.name, st.email, st.phone, st.college, st.degree].join(' ').toLowerCase();
        if (!text.includes(searchVal)) return false;
      }
      return true;
    });

    if (badge) badge.textContent = filtered.length;
    if (!tbody) return;

    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="table-empty">No students found matching your search and filter criteria.</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map(st => `
      <tr data-student-id="${esc(st.id)}">
        <td>
          <strong>${esc(st.name || '—')}</strong><br>
          <small class="fine">ID: ${esc(st.id)}</small>
        </td>
        <td>
          <a href="mailto:${esc(st.email)}">${esc(st.email)}</a><br>
          <small class="fine">${esc(st.phone || 'No phone')}</small>
        </td>
        <td>
          <span>${esc(st.college || '—')}</span><br>
          <small class="fine">${esc(st.degree || '')} ${st.passoutYear ? '(' + esc(st.passoutYear) + ')' : ''}</small>
        </td>
        <td>${fmtDate(st.createdAt)}</td>
        <td>${st.paid ? '<span class="badge ok">PAID</span>' : '<span class="badge">UNPAID</span>'}</td>
        <td>${statusBadge(st.active !== false ? 'ACTIVE' : 'INACTIVE', 'account')}</td>
        <td>
          <div class="admin-row-actions">
            <button type="button" class="btn sm outline btn-view-student" data-id="${esc(st.id)}">Profile</button>
            <button type="button" class="btn sm outline btn-toggle-student ${st.active === false ? 'ok' : 'danger'}" data-id="${esc(st.id)}" data-active="${st.active !== false}">
              ${st.active === false ? 'Activate' : 'Deactivate'}
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  function setupStudentsView() {
    const searchInput = document.getElementById('students-search');
    if (searchInput) {
      searchInput.addEventListener('input', () => renderStudentsTable());
    }

    const filterChips = document.querySelectorAll('.filter-chip[data-filter="students"]');
    filterChips.forEach(chip => {
      chip.addEventListener('click', () => {
        filterChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        currentStudentFilter = chip.getAttribute('data-value') || 'ALL';
        renderStudentsTable();
      });
    });

    const tbody = document.getElementById('tbody-admin-students');
    if (tbody) {
      tbody.addEventListener('click', async (e) => {
        const viewBtn = e.target.closest('.btn-view-student');
        if (viewBtn) {
          const studentId = viewBtn.getAttribute('data-id');
          openStudentDetailModal(studentId);
          return;
        }

        const toggleBtn = e.target.closest('.btn-toggle-student');
        if (toggleBtn) {
          const studentId = toggleBtn.getAttribute('data-id');
          const isCurrentlyActive = toggleBtn.getAttribute('data-active') === 'true';
          const actionText = isCurrentlyActive ? 'deactivate' : 'activate';
          if (!confirm(`Are you sure you want to ${actionText} this student's account access?`)) return;

          try {
            toggleBtn.disabled = true;
            await adminApi('toggle-student-status', { studentId, active: !isCurrentlyActive });
            await loadStudents();
          } catch (err) {
            alert('Error updating student status: ' + err.message);
          }
        }
      });
    }

    // Modal close button
    const closeBtn = document.getElementById('modal-student-close');
    const modal = document.getElementById('modal-student-detail');
    if (closeBtn && modal) {
      closeBtn.addEventListener('click', () => {
        modal.hidden = true;
      });
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.hidden = true;
      });
    }
  }

  async function openStudentDetailModal(studentId) {
    const modal = document.getElementById('modal-student-detail');
    const nameEl = document.getElementById('modal-student-name');
    const paidBadge = document.getElementById('modal-student-paid-badge');
    const contentEl = document.getElementById('modal-student-content');

    if (!modal || !contentEl) return;
    modal.hidden = false;
    contentEl.innerHTML = '<p class="table-loading">Loading student profile…</p>';

    try {
      const res = await adminApi('student-detail', { studentId });
      const st = res.student;
      const payments = res.payments || [];
      const referrals = res.referrals || [];
      const referredBy = res.referredBy;

      if (nameEl) nameEl.textContent = st.name || 'Student Profile';
      if (paidBadge) {
        paidBadge.className = 'badge ' + (st.paid ? 'ok' : '');
        paidBadge.textContent = st.paid ? 'PAID ENROLLED' : 'UNPAID';
      }

      contentEl.innerHTML = `
        <div class="student-profile-grid">
          <div class="card" style="padding:1rem;">
            <h4 style="margin:0 0 0.5rem;">Academic &amp; Contact Info</h4>
            <p><strong>Email:</strong> ${esc(st.email)}</p>
            <p><strong>Phone:</strong> ${esc(st.phone || '—')}</p>
            <p><strong>College:</strong> ${esc(st.college || '—')}</p>
            <p><strong>Degree / Branch:</strong> ${esc(st.degree || '—')}</p>
            <p><strong>Passout Year:</strong> ${esc(st.passoutYear || '—')}</p>
            <p><strong>Registered Date:</strong> ${fmtDate(st.createdAt)}</p>
            <p><strong>Account Status:</strong> ${st.active !== false ? '<span class="badge ok">ACTIVE</span>' : '<span class="badge danger">DEACTIVATED</span>'}</p>
          </div>

          <div class="card" style="padding:1rem;">
            <h4 style="margin:0 0 0.5rem;">Enrollment &amp; Referral Program</h4>
            <p><strong>Enrolled Course:</strong> ${esc(st.courseName || 'Java Full Stack Training Programme')}</p>
            <p><strong>Referral Code:</strong> ${st.referralCode ? '<code>' + esc(st.referralCode) + '</code>' : '<span class="fine">Generated upon course payment</span>'}</p>
            <p><strong>Withdrawable Balance:</strong> <strong style="color:var(--ok, #16a34a);">${fmtInr(st.referralBalance || 0)}</strong></p>
            <p><strong>Referred By:</strong> ${referredBy ? esc(referredBy.referrerName) + ' (<code>' + esc(referredBy.code) + '</code>)' : '<span class="fine">Direct signup (None)</span>'}</p>
          </div>
        </div>

        <h4 style="margin:1.5rem 0 0.5rem;">Payment Transactions &amp; Gateway Attempts (${payments.length})</h4>
        <div class="table-responsive">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Order ID</th>
                <th>Transaction ID</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${!payments.length ? '<tr><td colspan="6" class="table-empty">No payment attempts recorded for this student.</td></tr>' :
                payments.map(p => `
                  <tr>
                    <td>${fmtDate(p.createdAt || p.paidAt)}</td>
                    <td><code>${esc(p.orderId || '—')}</code></td>
                    <td><code>${esc(p.transactionId || p.paymentId || '—')}</code></td>
                    <td><strong>${fmtInr(p.amount || 5000)}</strong></td>
                    <td>${esc(p.method || 'UPI')}</td>
                    <td>${statusBadge(p.status, 'payment')}</td>
                  </tr>
                `).join('')
              }
            </tbody>
          </table>
        </div>

        <h4 style="margin:1.5rem 0 0.5rem;">Students Referred by this Student (${referrals.length})</h4>
        <div class="table-responsive">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Referred Student</th>
                <th>Date</th>
                <th>Course Payment</th>
                <th>Reward (₹1,000) Status</th>
              </tr>
            </thead>
            <tbody>
              ${!referrals.length ? '<tr><td colspan="4" class="table-empty">No students referred yet.</td></tr>' :
                referrals.map(r => `
                  <tr>
                    <td>
                      <strong>${esc(r.referredStudentName)}</strong><br>
                      <small class="fine">${esc(r.referredStudentEmail)}</small>
                    </td>
                    <td>${fmtDate(r.createdAt)}</td>
                    <td>${r.referredStudentPaid ? '<span class="badge ok">PAID</span>' : '<span class="badge">UNPAID</span>'}</td>
                    <td>${statusBadge(r.rewardStatus, 'reward')}</td>
                  </tr>
                `).join('')
              }
            </tbody>
          </table>
        </div>
      `;
    } catch (err) {
      contentEl.innerHTML = '<p class="form-status error">Failed to load student details: ' + esc(err.message) + '</p>';
    }
  }

  // ==========================================
  // VIEW: PAYMENT TRANSACTIONS
  // ==========================================
  async function loadPayments() {
    const res = await adminApi('payments');
    allPayments = res.payments || [];
    renderPaymentsTable();
  }

  function renderPaymentsTable() {
    const tbody = document.getElementById('tbody-admin-payments');
    const badge = document.getElementById('payments-count-badge');
    const sumEl = document.getElementById('payments-verified-sum');
    const searchVal = (document.getElementById('payments-search')?.value || '').toLowerCase().trim();

    let verifiedTotal = 0;
    const filtered = allPayments.filter(p => {
      const isPaid = String(p.status).toUpperCase() === 'SUCCESSFUL';
      if (isPaid) verifiedTotal += Number(p.amount || 5000);

      // Filter status
      if (currentPaymentFilter === 'SUCCESSFUL' && !isPaid) return false;
      if (currentPaymentFilter === 'PENDING' && String(p.status).toUpperCase() !== 'PENDING') return false;
      if (currentPaymentFilter === 'FAILED' && (isPaid || String(p.status).toUpperCase() === 'PENDING')) return false;

      // Search
      if (searchVal) {
        const text = [p.studentName, p.studentEmail, p.orderId, p.paymentId, p.transactionId].join(' ').toLowerCase();
        if (!text.includes(searchVal)) return false;
      }
      return true;
    });

    if (badge) badge.textContent = filtered.length;
    if (sumEl) sumEl.textContent = fmtInr(verifiedTotal);
    if (!tbody) return;

    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="table-empty">No payment transactions found matching criteria.</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map(p => {
      const isPaid = String(p.status).toUpperCase() === 'SUCCESSFUL';
      return `
        <tr data-payment-id="${esc(p.id)}">
          <td>
            <strong>${esc(p.studentName || 'Student')}</strong><br>
            <small class="fine"><a href="mailto:${esc(p.studentEmail)}">${esc(p.studentEmail || '—')}</a></small>
          </td>
          <td>${esc(p.courseName || 'Java Full Stack Training Programme')}</td>
          <td><strong>${fmtInr(p.amount || 5000)}</strong></td>
          <td><code>${esc(p.transactionId || p.paymentId || p.orderId || '—')}</code></td>
          <td>${fmtDate(p.createdAt || p.paidAt)}</td>
          <td>${esc(p.method || 'UPI')}</td>
          <td>${statusBadge(p.status, 'payment')}</td>
          <td>
            ${isPaid ?
              `<button type="button" class="btn sm outline btn-view-receipt" data-id="${esc(p.id)}">Receipt</button>` :
              `<span class="fine" style="color:#94a3b8;">No Receipt</span>`
            }
          </td>
        </tr>
      `;
    }).join('');
  }

  function setupPaymentsView() {
    const searchInput = document.getElementById('payments-search');
    if (searchInput) {
      searchInput.addEventListener('input', () => renderPaymentsTable());
    }

    const filterChips = document.querySelectorAll('.filter-chip[data-filter="payments"]');
    filterChips.forEach(chip => {
      chip.addEventListener('click', () => {
        filterChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        currentPaymentFilter = chip.getAttribute('data-value') || 'ALL';
        renderPaymentsTable();
      });
    });

    const tbody = document.getElementById('tbody-admin-payments');
    if (tbody) {
      tbody.addEventListener('click', async (e) => {
        const receiptBtn = e.target.closest('.btn-view-receipt');
        if (receiptBtn) {
          const paymentId = receiptBtn.getAttribute('data-id');
          openReceiptModal(paymentId);
        }
      });
    }
  }

  // ==========================================
  // RECEIPT MODAL (REUSED OFFICIAL TEMPLATE)
  // ==========================================
  async function openReceiptModal(paymentId) {
    const modal = document.getElementById('receipt-modal-backdrop');
    if (!modal) return;

    try {
      const res = await adminApi('receipt', { paymentId });
      const rec = res.receipt;
      if (!rec) throw new Error('Receipt not found');

      document.getElementById('r-number').textContent = rec.receiptNumber || 'SATURN-REC-2026-0001';
      document.getElementById('r-date').textContent = fmtDate(rec.paymentDate || rec.paidAt);
      document.getElementById('r-status-badge').textContent = (rec.paymentStatus || 'SUCCESSFUL').toUpperCase();
      document.getElementById('r-student-email').textContent = rec.studentEmail || '—';
      document.getElementById('r-student-meta').textContent = (rec.degree || 'Training Student') + (rec.college ? ' • ' + rec.college : '');
      document.getElementById('r-student-phone').textContent = rec.studentPhone ? 'Contact: ' + rec.studentPhone : '';
      document.getElementById('r-payment-id').textContent = rec.transactionId || rec.paymentId || '—';
      document.getElementById('r-order-id').textContent = rec.orderId || '—';
      document.getElementById('r-method').textContent = rec.paymentMethod || 'UPI';
      document.getElementById('r-course-name').textContent = rec.courseName || 'Java Full Stack Training Programme';

      modal.hidden = false;
    } catch (err) {
      alert('Error fetching receipt: ' + err.message);
    }
  }

  function setupReceiptModal() {
    const modal = document.getElementById('receipt-modal-backdrop');
    const closeBtn = document.getElementById('modal-btn-close');
    const printBtn = document.getElementById('modal-btn-print');
    const dlBtn = document.getElementById('modal-btn-download');

    if (closeBtn && modal) {
      closeBtn.addEventListener('click', () => { modal.hidden = true; });
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.hidden = true;
      });
    }

    if (printBtn) {
      printBtn.addEventListener('click', () => {
        window.print();
      });
    }

    if (dlBtn) {
      dlBtn.addEventListener('click', () => {
        window.print();
      });
    }
  }

  // ==========================================
  // VIEW: REFERRAL MANAGEMENT & REWARD WORKFLOW
  // ==========================================
  async function loadReferrals() {
    const res = await adminApi('referrals');
    allReferrals = res.referrals || [];
    renderReferralsTable();
  }

  function renderReferralsTable() {
    const tbody = document.getElementById('tbody-admin-referrals');
    const badge = document.getElementById('referrals-count-badge');
    const searchVal = (document.getElementById('referrals-search')?.value || '').toLowerCase().trim();

    const filtered = allReferrals.filter(r => {
      // Filter status
      if (currentReferralFilter !== 'ALL' && String(r.rewardStatus).toUpperCase() !== currentReferralFilter) {
        return false;
      }
      // Search
      if (searchVal) {
        const text = [r.referrerName, r.referrerEmail, r.referralCode, r.referredStudentName, r.referredStudentEmail].join(' ').toLowerCase();
        if (!text.includes(searchVal)) return false;
      }
      return true;
    });

    if (badge) badge.textContent = filtered.length;
    if (!tbody) return;

    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="table-empty">No referral records found matching criteria.</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map(r => {
      const isReferredPaid = r.referredStudentPaid === true;
      const isAlreadyCredited = r.rewardStatus === 'REFERRAL SUCCESSFULLY CREDITED';

      return `
        <tr data-referral-id="${esc(r.id)}">
          <td>
            <strong>${esc(r.referrerName || 'Referrer')}</strong><br>
            <small class="fine">${esc(r.referrerEmail || '—')}</small>
          </td>
          <td><code>${esc(r.referralCode)}</code></td>
          <td>
            <strong>${esc(r.referredStudentName || 'Referred')}</strong><br>
            <small class="fine">${esc(r.referredStudentEmail || '—')}</small>
          </td>
          <td>
            ${isReferredPaid ?
              '<span class="badge ok">PAID (₹5,000)</span>' :
              '<span class="badge warn">UNPAID (Pending)</span>'
            }
          </td>
          <td><strong>${fmtInr(r.rewardAmount || 1000)}</strong></td>
          <td>${statusBadge(r.rewardStatus, 'reward')}</td>
          <td>
            <button type="button" class="btn sm outline btn-manage-reward" data-id="${esc(r.id)}" ${!isReferredPaid ? 'title="Referred student has not completed course payment"' : ''}>
              ${isAlreadyCredited ? 'View Status' : 'Update Status'}
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  function setupReferralsView() {
    const searchInput = document.getElementById('referrals-search');
    if (searchInput) {
      searchInput.addEventListener('input', () => renderReferralsTable());
    }

    const filterChips = document.querySelectorAll('.filter-chip[data-filter="referrals"]');
    filterChips.forEach(chip => {
      chip.addEventListener('click', () => {
        filterChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        currentReferralFilter = chip.getAttribute('data-value') || 'ALL';
        renderReferralsTable();
      });
    });

    const tbody = document.getElementById('tbody-admin-referrals');
    if (tbody) {
      tbody.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-manage-reward');
        if (btn) {
          const id = btn.getAttribute('data-id');
          openRewardModal(id);
        }
      });
    }

    // Modal controls
    const modal = document.getElementById('modal-update-reward');
    const closeBtn = document.getElementById('modal-reward-close');
    const cancelBtn = document.getElementById('modal-reward-cancel');
    const form = document.getElementById('form-update-reward');

    if (closeBtn && modal) {
      closeBtn.addEventListener('click', () => { modal.hidden = true; });
      cancelBtn.addEventListener('click', () => { modal.hidden = true; });
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.hidden = true;
      });
    }

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const referralId = document.getElementById('reward-field-referral-id').value;
        const newStatus = document.getElementById('reward-field-status').value;
        const notes = document.getElementById('reward-field-notes').value.trim();
        const statusEl = document.getElementById('reward-update-status');
        const submitBtn = document.getElementById('modal-reward-submit');

        if (newStatus === 'REFERRAL SUCCESSFULLY CREDITED') {
          if (!confirm('CONFIRMATION: Crediting this referral will add ₹1,000 to the referrer\'s available withdrawable balance. Proceed?')) {
            return;
          }
        }

        submitBtn.disabled = true;
        statusEl.className = 'form-status';
        statusEl.textContent = 'Updating reward status…';

        try {
          await adminApi('update-reward-status', { referralId, status: newStatus, notes });
          statusEl.className = 'form-status ok';
          statusEl.textContent = 'Referral reward updated successfully!';
          setTimeout(() => {
            modal.hidden = true;
            submitBtn.disabled = false;
            statusEl.textContent = '';
            loadReferrals();
            loadStats();
          }, 600);
        } catch (err) {
          submitBtn.disabled = false;
          statusEl.className = 'form-status error';
          statusEl.textContent = err.message || 'Failed to update reward status.';
        }
      });
    }
  }

  function openRewardModal(referralId) {
    const modal = document.getElementById('modal-update-reward');
    const ref = allReferrals.find(r => r.id === referralId);
    if (!modal || !ref) return;

    document.getElementById('reward-field-referral-id').value = ref.id;
    document.getElementById('reward-field-referrer').textContent = `${ref.referrerName} (${ref.referrerEmail})`;
    document.getElementById('reward-field-referred').textContent = `${ref.referredStudentName} (${ref.referredStudentEmail}) - Payment: ${ref.referredStudentPaid ? 'PAID' : 'UNPAID'}`;
    
    const select = document.getElementById('reward-field-status');
    select.value = ref.rewardStatus || 'MONEY UNCREDITED';

    const submitBtn = document.getElementById('modal-reward-submit');
    const hint = document.getElementById('reward-status-hint');

    // Rule: Referral rewards cannot be progressed if referred student has not paid
    if (!ref.referredStudentPaid) {
      select.disabled = true;
      submitBtn.disabled = true;
      hint.textContent = 'LOCKED: The referred student has not completed course payment yet. Referral reward cannot be progressed.';
      hint.style.color = '#ef4444';
    } else {
      select.disabled = false;
      submitBtn.disabled = false;
      hint.textContent = 'Selecting "REFERRAL SUCCESSFULLY CREDITED" will credit ₹1,000 to the referrer\'s withdrawable balance.';
      hint.style.color = '#64748b';
    }

    document.getElementById('reward-update-status').textContent = '';
    modal.hidden = false;
  }

  // ==========================================
  // VIEW: COURSE MATERIALS & PDF UPLOAD/PREVIEW
  // ==========================================
  async function loadMaterials() {
    const res = await adminApi('materials');
    allMaterials = res.materials || [];
    renderMaterialsTable();
  }

  function renderMaterialsTable() {
    const tbody = document.getElementById('tbody-admin-materials');
    const badge = document.getElementById('materials-count-badge');
    if (badge) badge.textContent = allMaterials.length;
    if (!tbody) return;

    if (!allMaterials.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="table-empty">No course materials uploaded yet. Click "Upload New PDF" to add one.</td></tr>';
      return;
    }

    tbody.innerHTML = allMaterials.map(m => {
      const isActive = m.active !== false;
      return `
        <tr data-material-id="${esc(m.id)}">
          <td><strong>${esc(m.order || 1)}</strong></td>
          <td>
            <strong>${esc(m.title)}</strong><br>
            <small class="fine">${esc(m.description || 'No description')}</small>
          </td>
          <td><span class="badge">${esc(m.category || 'Curriculum')}</span></td>
          <td>${esc(m.fileSizeFormatted || (m.fileSize ? Math.round(m.fileSize / 1024) + ' KB' : '—'))}</td>
          <td>${fmtDate(m.createdAt || m.updatedAt)}</td>
          <td>${isActive ? '<span class="badge ok">ACTIVE</span>' : '<span class="badge danger">HIDDEN</span>'}</td>
          <td>
            <div class="admin-row-actions">
              <button type="button" class="btn sm outline btn-preview-mat" data-id="${esc(m.id)}">Preview</button>
              <button type="button" class="btn sm outline btn-edit-mat" data-id="${esc(m.id)}">Edit</button>
              <button type="button" class="btn sm outline btn-replace-mat" data-id="${esc(m.id)}">Replace</button>
              <button type="button" class="btn sm outline btn-toggle-mat" data-id="${esc(m.id)}" data-active="${isActive}">
                ${isActive ? 'Hide' : 'Show'}
              </button>
              <button type="button" class="btn sm outline danger btn-delete-mat" data-id="${esc(m.id)}">Delete</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  function setupMaterialsView() {
    const uploadBtn = document.getElementById('btn-open-upload-material');
    const uploadModal = document.getElementById('modal-upload-material');
    const uploadClose = document.getElementById('modal-upload-close');
    const uploadCancel = document.getElementById('modal-upload-cancel');
    const uploadForm = document.getElementById('form-upload-material');

    if (uploadBtn && uploadModal) {
      uploadBtn.addEventListener('click', () => {
        uploadForm.reset();
        document.getElementById('upload-mat-status').textContent = '';
        uploadModal.hidden = false;
      });
      uploadClose.addEventListener('click', () => { uploadModal.hidden = true; });
      uploadCancel.addEventListener('click', () => { uploadModal.hidden = true; });
      uploadModal.addEventListener('click', (e) => {
        if (e.target === uploadModal) uploadModal.hidden = true;
      });
    }

    // Upload form submission
    if (uploadForm) {
      uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('upload-mat-title').value.trim();
        const category = document.getElementById('upload-mat-category').value.trim();
        const description = document.getElementById('upload-mat-desc').value.trim();
        const fileInput = document.getElementById('upload-mat-file');
        const statusEl = document.getElementById('upload-mat-status');
        const submitBtn = document.getElementById('modal-upload-submit');

        if (!fileInput.files || !fileInput.files[0]) {
          statusEl.className = 'form-status error';
          statusEl.textContent = 'Please select a PDF file to upload.';
          return;
        }

        const file = fileInput.files[0];
        if (file.size > 15 * 1024 * 1024) {
          statusEl.className = 'form-status error';
          statusEl.textContent = 'File exceeds maximum allowed size of 15MB.';
          return;
        }

        submitBtn.disabled = true;
        statusEl.className = 'form-status';
        statusEl.textContent = 'Reading and validating PDF…';

        try {
          const base64Data = await readFileAsBase64(file);
          statusEl.textContent = 'Uploading to server…';

          await adminApi('upload-material', {
            title,
            category,
            description,
            filename: file.name,
            fileData: base64Data
          });

          statusEl.className = 'form-status ok';
          statusEl.textContent = 'Course material PDF uploaded successfully!';
          setTimeout(() => {
            uploadModal.hidden = true;
            submitBtn.disabled = false;
            uploadForm.reset();
            loadMaterials();
          }, 600);
        } catch (err) {
          submitBtn.disabled = false;
          statusEl.className = 'form-status error';
          statusEl.textContent = err.message || 'Failed to upload PDF.';
        }
      });
    }

    // Materials table action delegation
    const tbody = document.getElementById('tbody-admin-materials');
    if (tbody) {
      tbody.addEventListener('click', async (e) => {
        const previewBtn = e.target.closest('.btn-preview-mat');
        if (previewBtn) {
          const id = previewBtn.getAttribute('data-id');
          openMaterialPreview(id);
          return;
        }

        const editBtn = e.target.closest('.btn-edit-mat');
        if (editBtn) {
          const id = editBtn.getAttribute('data-id');
          openEditMaterialModal(id);
          return;
        }

        const replaceBtn = e.target.closest('.btn-replace-mat');
        if (replaceBtn) {
          const id = replaceBtn.getAttribute('data-id');
          openReplaceMaterialModal(id);
          return;
        }

        const toggleBtn = e.target.closest('.btn-toggle-mat');
        if (toggleBtn) {
          const id = toggleBtn.getAttribute('data-id');
          const isActive = toggleBtn.getAttribute('data-active') === 'true';
          try {
            await adminApi('update-material', { materialId: id, active: !isActive });
            await loadMaterials();
          } catch (err) {
            alert('Failed to update status: ' + err.message);
          }
          return;
        }

        const deleteBtn = e.target.closest('.btn-delete-mat');
        if (deleteBtn) {
          const id = deleteBtn.getAttribute('data-id');
          if (!confirm('Are you sure you want to permanently delete this course material document?')) return;
          try {
            await adminApi('delete-material', { materialId: id });
            await loadMaterials();
          } catch (err) {
            alert('Failed to delete material: ' + err.message);
          }
        }
      });
    }

    setupEditMaterialModal();
    setupReplaceMaterialModal();
    setupAdminPdfViewer();
  }

  // Edit Material Modal
  function openEditMaterialModal(id) {
    const modal = document.getElementById('modal-edit-material');
    const mat = allMaterials.find(m => m.id === id);
    if (!modal || !mat) return;

    document.getElementById('edit-mat-id').value = mat.id;
    document.getElementById('edit-mat-title').value = mat.title || '';
    document.getElementById('edit-mat-category').value = mat.category || '';
    document.getElementById('edit-mat-desc').value = mat.description || '';
    document.getElementById('edit-mat-order').value = mat.order || 1;
    document.getElementById('edit-mat-status').textContent = '';
    modal.hidden = false;
  }

  function setupEditMaterialModal() {
    const modal = document.getElementById('modal-edit-material');
    const form = document.getElementById('form-edit-material');
    const closeBtn = document.getElementById('modal-edit-close');
    const cancelBtn = document.getElementById('modal-edit-cancel');

    if (closeBtn && modal) {
      closeBtn.addEventListener('click', () => { modal.hidden = true; });
      cancelBtn.addEventListener('click', () => { modal.hidden = true; });
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.hidden = true;
      });
    }

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const materialId = document.getElementById('edit-mat-id').value;
        const title = document.getElementById('edit-mat-title').value.trim();
        const category = document.getElementById('edit-mat-category').value.trim();
        const description = document.getElementById('edit-mat-desc').value.trim();
        const order = Number(document.getElementById('edit-mat-order').value) || 1;
        const statusEl = document.getElementById('edit-mat-status');
        const submitBtn = document.getElementById('modal-edit-submit');

        submitBtn.disabled = true;
        statusEl.className = 'form-status';
        statusEl.textContent = 'Saving changes…';

        try {
          await adminApi('update-material', { materialId, title, category, description, order });
          statusEl.className = 'form-status ok';
          statusEl.textContent = 'Material updated successfully!';
          setTimeout(() => {
            modal.hidden = true;
            submitBtn.disabled = false;
            loadMaterials();
          }, 500);
        } catch (err) {
          submitBtn.disabled = false;
          statusEl.className = 'form-status error';
          statusEl.textContent = err.message || 'Failed to update material.';
        }
      });
    }
  }

  // Replace Material Modal
  function openReplaceMaterialModal(id) {
    const modal = document.getElementById('modal-replace-material');
    const mat = allMaterials.find(m => m.id === id);
    if (!modal || !mat) return;

    document.getElementById('replace-mat-id').value = mat.id;
    document.getElementById('replace-mat-doc-name').textContent = 'Document: ' + (mat.title || 'Course Material');
    document.getElementById('replace-mat-file').value = '';
    document.getElementById('replace-mat-status').textContent = '';
    modal.hidden = false;
  }

  function setupReplaceMaterialModal() {
    const modal = document.getElementById('modal-replace-material');
    const form = document.getElementById('form-replace-material');
    const closeBtn = document.getElementById('modal-replace-close');
    const cancelBtn = document.getElementById('modal-replace-cancel');

    if (closeBtn && modal) {
      closeBtn.addEventListener('click', () => { modal.hidden = true; });
      cancelBtn.addEventListener('click', () => { modal.hidden = true; });
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.hidden = true;
      });
    }

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const materialId = document.getElementById('replace-mat-id').value;
        const fileInput = document.getElementById('replace-mat-file');
        const statusEl = document.getElementById('replace-mat-status');
        const submitBtn = document.getElementById('modal-replace-submit');

        if (!fileInput.files || !fileInput.files[0]) {
          statusEl.className = 'form-status error';
          statusEl.textContent = 'Please choose a replacement PDF file.';
          return;
        }

        const file = fileInput.files[0];
        if (file.size > 15 * 1024 * 1024) {
          statusEl.className = 'form-status error';
          statusEl.textContent = 'File exceeds maximum allowed size of 15MB.';
          return;
        }

        submitBtn.disabled = true;
        statusEl.className = 'form-status';
        statusEl.textContent = 'Uploading replacement PDF…';

        try {
          const base64Data = await readFileAsBase64(file);
          await adminApi('replace-material', {
            materialId,
            filename: file.name,
            fileData: base64Data
          });

          statusEl.className = 'form-status ok';
          statusEl.textContent = 'Replacement PDF uploaded successfully!';
          setTimeout(() => {
            modal.hidden = true;
            submitBtn.disabled = false;
            loadMaterials();
          }, 600);
        } catch (err) {
          submitBtn.disabled = false;
          statusEl.className = 'form-status error';
          statusEl.textContent = err.message || 'Failed to replace PDF.';
        }
      });
    }
  }

  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        const commaIdx = result.indexOf(',');
        resolve(commaIdx > -1 ? result.slice(commaIdx + 1) : result);
      };
      reader.onerror = () => reject(new Error('Failed to read file from disk.'));
      reader.readAsDataURL(file);
    });
  }

  // ==========================================
  // EMBEDDED PDF VIEWER (ADMIN PREVIEW)
  // ==========================================
  let pdfDoc = null;
  let pdfCurrentPage = 1;
  let pdfTotalPages = 1;
  let pdfZoom = 1.0;
  let isRenderingPdf = false;
  let activeMaterialId = null;

  async function openMaterialPreview(materialId) {
    const modal = document.getElementById('pdf-viewer-modal');
    const titleEl = document.getElementById('pdf-doc-title');
    const catEl = document.getElementById('pdf-doc-category');
    const mat = allMaterials.find(m => m.id === materialId);
    if (!modal) return;

    activeMaterialId = materialId;
    if (titleEl) titleEl.textContent = (mat && mat.title) || 'Course Document';
    if (catEl) catEl.textContent = (mat && mat.category) || 'Curriculum';

    modal.hidden = false;
    document.getElementById('pdf-loading').hidden = false;
    document.getElementById('pdf-error').hidden = true;

    pdfCurrentPage = 1;
    pdfZoom = 1.0;
    updateZoomDisplay();

    try {
      if (typeof window.pdfjsLib === 'undefined') {
        throw new Error('PDF viewing engine not yet loaded.');
      }
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/assets/vendor/pdfjs/pdf.worker.min.js';

      const token = getToken();
      const headers = {};
      if (token) headers['Authorization'] = 'Bearer ' + token;

      // Stream PDF directly from server
      const pdfUrl = '/api/admin?action=preview-material&materialId=' + encodeURIComponent(materialId) + '&t=' + encodeURIComponent(token);
      
      const loadingTask = window.pdfjsLib.getDocument({
        url: pdfUrl,
        httpHeaders: headers,
        withCredentials: true
      });

      pdfDoc = await loadingTask.promise;
      pdfTotalPages = pdfDoc.numPages || 1;
      document.getElementById('pdf-page-count').textContent = pdfTotalPages;
      document.getElementById('pdf-loading').hidden = true;

      renderPdfPage(pdfCurrentPage);
    } catch (err) {
      document.getElementById('pdf-loading').hidden = true;
      const errBox = document.getElementById('pdf-error');
      const errMsg = document.getElementById('pdf-error-msg');
      if (errBox) errBox.hidden = false;
      if (errMsg) errMsg.textContent = 'Error loading document: ' + err.message;
    }
  }

  async function renderPdfPage(pageNum) {
    if (!pdfDoc || isRenderingPdf) return;
    isRenderingPdf = true;

    try {
      const page = await pdfDoc.getPage(pageNum);
      const canvas = document.getElementById('pdf-canvas');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');

      const wrapper = document.getElementById('pdf-canvas-wrapper');
      const containerWidth = (wrapper ? wrapper.clientWidth : 800) - 40;
      const unscaledViewport = page.getViewport({ scale: 1 });
      const baseScale = Math.min(Math.max(containerWidth / unscaledViewport.width, 0.6), 2.0);
      const viewport = page.getViewport({ scale: baseScale * pdfZoom });

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      const renderContext = {
        canvasContext: ctx,
        viewport: viewport
      };

      await page.render(renderContext).promise;
      document.getElementById('pdf-page-num').textContent = pageNum;
      pdfCurrentPage = pageNum;
    } catch (err) {
      console.error('Error rendering PDF page:', err);
    } finally {
      isRenderingPdf = false;
    }
  }

  function updateZoomDisplay() {
    const el = document.getElementById('pdf-zoom-val');
    if (el) el.textContent = Math.round(pdfZoom * 100) + '%';
  }

  function setupAdminPdfViewer() {
    const modal = document.getElementById('pdf-viewer-modal');
    const backBtn = document.getElementById('pdf-btn-back');
    const prevBtn = document.getElementById('pdf-btn-prev');
    const nextBtn = document.getElementById('pdf-btn-next');
    const zoomInBtn = document.getElementById('pdf-btn-zoom-in');
    const zoomOutBtn = document.getElementById('pdf-btn-zoom-out');
    const retryBtn = document.getElementById('pdf-btn-retry');

    if (backBtn && modal) {
      backBtn.addEventListener('click', () => {
        modal.hidden = true;
        if (pdfDoc) {
          try { pdfDoc.destroy(); } catch (_) {}
          pdfDoc = null;
        }
      });
    }

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (pdfCurrentPage > 1) renderPdfPage(pdfCurrentPage - 1);
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (pdfCurrentPage < pdfTotalPages) renderPdfPage(pdfCurrentPage + 1);
      });
    }

    if (zoomInBtn) {
      zoomInBtn.addEventListener('click', () => {
        if (pdfZoom < 2.5) {
          pdfZoom = Math.min(pdfZoom + 0.2, 2.5);
          updateZoomDisplay();
          renderPdfPage(pdfCurrentPage);
        }
      });
    }

    if (zoomOutBtn) {
      zoomOutBtn.addEventListener('click', () => {
        if (pdfZoom > 0.6) {
          pdfZoom = Math.max(pdfZoom - 0.2, 0.6);
          updateZoomDisplay();
          renderPdfPage(pdfCurrentPage);
        }
      });
    }

    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        if (activeMaterialId) openMaterialPreview(activeMaterialId);
      });
    }

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (!modal || modal.hidden) return;
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        if (pdfCurrentPage > 1) renderPdfPage(pdfCurrentPage - 1);
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        if (pdfCurrentPage < pdfTotalPages) renderPdfPage(pdfCurrentPage + 1);
      } else if (e.key === 'Escape') {
        modal.hidden = true;
      }
    });
  }

  // ==========================================
  // VIEW: SETTINGS & AUDIT TRAIL
  // ==========================================
  async function loadAuditLogs() {
    const tbody = document.getElementById('tbody-admin-audit-logs');
    if (!tbody) return;

    try {
      const res = await adminApi('audit-logs');
      const logs = res.logs || [];

      if (!logs.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="table-empty">No administrative audit entries logged yet.</td></tr>';
        return;
      }

      tbody.innerHTML = logs.map(l => `
        <tr>
          <td>${fmtDate(l.timestamp)}</td>
          <td><code>${esc(l.action)}</code></td>
          <td>${esc(l.target || '—')}</td>
          <td><code>${esc(l.ip || '—')}</code></td>
          <td><small class="fine">${esc(typeof l.details === 'object' ? JSON.stringify(l.details) : String(l.details || '—'))}</small></td>
        </tr>
      `).join('');
    } catch (_) {
      tbody.innerHTML = '<tr><td colspan="5" class="table-empty">Failed to load audit logs.</td></tr>';
    }
  }

  function setupSettingsView() {
    const form = document.getElementById('admin-change-password-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const currPass = document.getElementById('admin-current-pass').value;
      const newPass = document.getElementById('admin-new-pass').value;
      const confirmPass = document.getElementById('admin-confirm-pass').value;
      const statusEl = document.getElementById('admin-password-status');
      const submitBtn = document.getElementById('btn-submit-change-pass');

      if (!currPass || !newPass || !confirmPass) {
        statusEl.className = 'form-status error';
        statusEl.textContent = 'Please fill out all password fields.';
        return;
      }

      if (newPass.length < 8) {
        statusEl.className = 'form-status error';
        statusEl.textContent = 'New password must be at least 8 characters long.';
        return;
      }

      if (newPass !== confirmPass) {
        statusEl.className = 'form-status error';
        statusEl.textContent = 'New password and confirm password do not match.';
        return;
      }

      submitBtn.disabled = true;
      statusEl.className = 'form-status';
      statusEl.textContent = 'Updating password…';

      try {
        await adminApi('change-password', {
          currentPassword: currPass,
          newPassword: newPass
        });

        statusEl.className = 'form-status ok';
        statusEl.textContent = 'Admin password changed successfully!';
        form.reset();
        submitBtn.disabled = false;
        loadAuditLogs();
      } catch (err) {
        submitBtn.disabled = false;
        statusEl.className = 'form-status error';
        statusEl.textContent = err.message || 'Failed to update admin password.';
      }
    });
  }

  // Auto-initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initAdminLogin();
      initAdminDashboard();
    });
  } else {
    initAdminLogin();
    initAdminDashboard();
  }
})();
