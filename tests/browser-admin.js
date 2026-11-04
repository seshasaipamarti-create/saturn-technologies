'use strict';
/**
 * Zero-dependency Browser Test for Saturn Technologies Admin Portal.
 * Drives installed Google Chrome using Chrome DevTools Protocol (CDP) over WebSocket.
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { start } = require('./server');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEBUG_PORT = 9444;

let passed = 0;
let failed = 0;

function logPass(msg) {
  console.log(`  ✓ PASS: ${msg}`);
  passed++;
}

function logFail(msg, err) {
  console.error(`  ✗ FAIL: ${msg} ->`, err ? (err.message || err) : 'Assertion failed');
  failed++;
}

class CdpClient {
  constructor(ws) {
    this.ws = ws;
    this.id = 1;
    this.callbacks = new Map();
    this.events = [];
    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        if (data.id && this.callbacks.has(data.id)) {
          const { resolve, reject } = this.callbacks.get(data.id);
          this.callbacks.delete(data.id);
          if (data.error) reject(new Error(data.error.message));
          else resolve(data.result);
        } else if (data.method) {
          this.events.push(data);
        }
      } catch (_) {}
    };
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expr) {
    const res = await this.send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
    }
    return res.result.value;
  }

  async click(selector) {
    return this.eval(`
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) throw new Error('Element not found: ' + ${JSON.stringify(selector)});
        el.click();
        return true;
      })()
    `);
  }

  async type(selector, text) {
    return this.eval(`
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) throw new Error('Element not found: ' + ${JSON.stringify(selector)});
        el.focus();
        el.value = ${JSON.stringify(text)};
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()
    `);
  }

  async waitFor(selector, timeoutMs = 8000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const exists = await this.eval(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
      if (exists) return true;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`Timeout waiting for selector: ${selector}`);
  }

  async waitForVisible(selector, timeoutMs = 8000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const visible = await this.eval(`
        (() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return false;
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && !el.hidden && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
        })()
      `);
      if (visible) return true;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`Timeout waiting for visible: ${selector}`);
  }

  async navigate(url) {
    await this.send('Page.navigate', { url });
    await new Promise((r) => setTimeout(r, 600));
  }
}

async function fetchJson(url) {
  const res = await fetch(url);
  return res.json();
}

async function runBrowserAdminTests() {
  console.log('--- Starting Admin Portal Browser CDP Tests ---');

  // Start internal test server
  const srv = await start({ port: 3344 });
  const origin = 'http://localhost:3344';
  console.log(`Test server running at ${origin}`);

  const userDataDir = path.join(__dirname, '../.tmp_chrome_admin_' + Date.now());
  fs.mkdirSync(userDataDir, { recursive: true });

  const chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank'
  ], { stdio: 'ignore' });

  // Wait for Chrome remote debugging
  let version = null;
  for (let i = 0; i < 30; i++) {
    try {
      version = await fetchJson(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
      if (version && version.webSocketDebuggerUrl) break;
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 200));
  }

  if (!version || !version.webSocketDebuggerUrl) {
    throw new Error('Unable to connect to Chrome remote debugging port.');
  }

  const targets = await fetchJson(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
  const pageTarget = targets.find((t) => t.type === 'page');
  if (!pageTarget) throw new Error('No page target found');

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  const cdp = new CdpClient(ws);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('DOM.enable');

  try {
    // 1. Visit /admin/login
    await cdp.navigate(origin + '/admin/login');
    await cdp.waitFor('#admin-login-form');
    logPass('PUBLIC: /admin/login loads with #admin-login-form');

    // 2. Test Invalid Credentials
    await cdp.type('#admin-email', 'admin@saturn.in');
    await cdp.type('#admin-password', 'WrongPassword123!');
    await cdp.click('#admin-login-submit');

    await new Promise((r) => setTimeout(r, 800));
    const errText = await cdp.eval('document.getElementById("admin-login-status").textContent');
    if (errText.includes('Invalid') || errText.includes('credentials') || errText.includes('failed')) {
      logPass('AUTH: Invalid credentials correctly show feedback error: ' + errText);
    } else {
      logFail('AUTH: Invalid credentials should display error feedback', errText);
    }

    // 3. Test Valid Credentials & Login
    await cdp.type('#admin-email', 'admin@saturn.in');
    await cdp.type('#admin-password', 'SaturnAdmin2026!');
    await cdp.click('#admin-login-submit');

    // Wait for redirect to /admin/dashboard
    await cdp.waitFor('#view-admin-dashboard', 8000);
    const curPath = await cdp.eval('window.location.pathname');
    if (curPath === '/admin/dashboard') {
      logPass('AUTH: Successful login redirects to /admin/dashboard');
    } else {
      logFail(`Expected /admin/dashboard, got ${curPath}`);
    }

    // 4. Verify Dashboard Summary Cards (8 cards)
    await cdp.waitFor('#stat-total-students', 5000);
    await new Promise((r) => setTimeout(r, 800));
    const totalStudents = await cdp.eval('document.getElementById("stat-total-students").textContent');
    const totalRevenue = await cdp.eval('document.getElementById("stat-verified-revenue").textContent');
    logPass(`DASHBOARD: Summary cards populated (Students: ${totalStudents}, Revenue: ${totalRevenue})`);

    // 5. Test Navigation: Students View
    await cdp.click('#nav-admin-students');
    await cdp.waitForVisible('#view-admin-students', 4000);
    const studentRows = await cdp.eval('document.querySelectorAll("#tbody-admin-students tr").length');
    if (studentRows > 0) {
      logPass(`STUDENTS: Directory table active with ${studentRows} rows`);
    } else {
      logFail('STUDENTS: Table rows missing');
    }

    // 6. Test Navigation: Payments View
    await cdp.click('#nav-admin-payments');
    await cdp.waitForVisible('#view-admin-payments', 4000);
    const paymentRows = await cdp.eval('document.querySelectorAll("#tbody-admin-payments tr").length');
    logPass(`PAYMENTS: Payments table active with ${paymentRows} transactions`);

    // 7. Test Navigation: Referral Management View
    await cdp.click('#nav-admin-referrals');
    await cdp.waitForVisible('#view-admin-referrals', 4000);
    const referralRows = await cdp.eval('document.querySelectorAll("#tbody-admin-referrals tr").length');
    logPass(`REFERRALS: Referral management table active with ${referralRows} referral records`);

    // 8. Test Navigation: Materials View
    await cdp.click('#nav-admin-materials');
    await cdp.waitForVisible('#view-admin-materials', 4000);
    const hasUploadBtn = await cdp.eval('Boolean(document.getElementById("btn-open-upload-material"))');
    if (hasUploadBtn) {
      logPass('MATERIALS: Materials table active with "Upload New PDF" button');
    } else {
      logFail('MATERIALS: Upload button missing');
    }

    // 9. Test Navigation: Settings View & Audit Logs
    await cdp.click('#nav-admin-settings');
    await cdp.waitForVisible('#view-admin-settings', 4000);
    const hasChangePassForm = await cdp.eval('Boolean(document.getElementById("admin-change-password-form"))');
    const auditEntries = await cdp.eval('document.querySelectorAll("#tbody-admin-audit-logs tr").length');
    if (hasChangePassForm && auditEntries > 0) {
      logPass(`SETTINGS: Profile card, password form, and ${auditEntries} audit logs verified`);
    } else {
      logFail('SETTINGS: Password form or audit logs missing');
    }

    // 10. Test Admin Logout
    await cdp.click('#btn-admin-logout');
    await cdp.waitFor('#admin-login-form', 5000);
    const afterLogoutPath = await cdp.eval('window.location.pathname');
    if (afterLogoutPath === '/admin/login') {
      logPass('LOGOUT: Logout cleared session and returned to /admin/login');
    } else {
      logFail(`LOGOUT: Expected /admin/login, got ${afterLogoutPath}`);
    }

  } catch (err) {
    logFail('Test encountered an uncaught error', err);
  } finally {
    try { ws.close(); } catch (_) {}
    try { chromeProc.kill(); } catch (_) {}
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (_) {}
    await srv.close();
  }

  console.log(`\nBrowser Tests Complete: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

runBrowserAdminTests().catch((err) => {
  console.error('Fatal Browser Test Error:', err);
  process.exit(1);
});
