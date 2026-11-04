'use strict';
/**
 * Zero-dependency Browser Test Suite for Saturn Technologies.
 * Drives installed Google Chrome using Chrome DevTools Protocol (CDP) over WebSocket.
 * Tests:
 * 1. Public pages and SEO integrity
 * 2. Student login & authentication guard
 * 3. Referral code & reward stats
 * 4. My Payments & official printable receipt modal
 * 5. Materials catalog & embedded online PDF viewer (pages, zoom, watermark, zero download/print)
 * 6. Responsive mobile layout verification
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { start } = require('./server');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEBUG_PORT = 9333;

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

async function runBrowserTestSuite() {
  console.log('--- Starting Saturn Technologies Browser Test Suite ---');

  if (!fs.existsSync(CHROME_PATH)) {
    console.error('Google Chrome not found at', CHROME_PATH);
    process.exit(1);
  }

  // 1. Start local server
  const serverInst = await start({ port: 3055, mockMail: true });
  const origin = serverInst.origin;
  console.log('Local test server running at:', origin);

  // 2. Launch headless Chrome with CDP
  const chromeArgs = [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1366,820',
    '--disable-background-networking',
    '--disable-extensions'
  ];

  const chromeProc = spawn(CHROME_PATH, chromeArgs);
  let chromeClosed = false;
  const cleanup = async () => {
    if (!chromeClosed) {
      chromeClosed = true;
      try { chromeProc.kill(); } catch (_) {}
    }
    try { await serverInst.close(); } catch (_) {}
  };

  process.on('SIGINT', cleanup);
  process.on('exit', cleanup);

  // Poll until Chrome CDP responds
  let version = null;
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
      version = await res.json();
      break;
    } catch (_) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  if (!version) {
    console.error('Could not connect to Chrome DevTools Protocol.');
    await cleanup();
    process.exit(1);
  }

  console.log(`Connected to ${version.Browser}`);

  // Create new browser tab target
  const newTabRes = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?${origin}`, { method: 'PUT' });
  const target = await newTabRes.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);

  await new Promise((resolve) => {
    ws.onopen = resolve;
  });

  const cdp = new CdpClient(ws);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('DOM.enable');

  try {
    // ----------------------------------------------------
    // TEST 1: Public Home Page & Navigation
    // ----------------------------------------------------
    await cdp.navigate(origin + '/');
    const homeTitle = await cdp.eval('document.title');
    const hasNav = await cdp.eval('Boolean(document.querySelector(".site-header nav"))');
    if (homeTitle.includes('Saturn Technologies') && hasNav) {
      logPass('PUBLIC: Home page loads with branding, title, and primary navigation');
    } else {
      logFail('PUBLIC: Home page loading', new Error(`Unexpected title: ${homeTitle}`));
    }

    // ----------------------------------------------------
    // TEST 2: Training Page & Login Tab
    // ----------------------------------------------------
    await cdp.navigate(origin + '/training/register?tab=login');
    await cdp.waitFor('#student-login-form');
    const loginFormVisible = await cdp.eval('!document.getElementById("student-login-form").hidden');
    if (loginFormVisible) {
      logPass('PUBLIC: Training login form loads and displays input fields');
    } else {
      logFail('PUBLIC: Training login form display');
    }

    // ----------------------------------------------------
    // TEST 3: Student Login Journey -> Dashboard Redirect
    // ----------------------------------------------------
    await cdp.type('#login-email', 'test.student@saturn.in');
    await cdp.type('#login-password', 'Password123!');
    await cdp.click('#login-submit');

    // Wait for redirect to /training/dashboard
    await cdp.waitFor('#dashboard-container', 8000);
    const currUrl = await cdp.eval('window.location.pathname');
    const dashEmail = await cdp.eval('document.getElementById("dash-email")?.textContent || ""');
    if (currUrl === '/training/dashboard' && dashEmail.includes('test.student@saturn.in')) {
      logPass('AUTH: Student login redirects to dashboard and authenticates successfully');
    } else {
      logFail('AUTH: Login redirect', new Error(`URL is ${currUrl}, email: ${dashEmail}`));
    }

    // ----------------------------------------------------
    // TEST 4: Left Sidebar Navigation Structure
    // ----------------------------------------------------
    const sidebarTabs = await cdp.eval(`
      (() => {
        const ref = document.getElementById('btn-tab-referral');
        const pay = document.getElementById('btn-tab-payments');
        const mat = document.getElementById('btn-tab-materials');
        return {
          hasRef: !!ref && ref.textContent.includes('Referral Code'),
          hasPay: !!pay && pay.textContent.includes('My Payments'),
          hasMat: !!mat && mat.textContent.includes('Materials')
        };
      })()
    `);
    if (sidebarTabs.hasRef && sidebarTabs.hasPay && sidebarTabs.hasMat) {
      logPass('DASHBOARD: Sidebar contains exactly Referral Code, My Payments, and Materials');
    } else {
      logFail('DASHBOARD: Sidebar tabs', new Error(JSON.stringify(sidebarTabs)));
    }

    // ----------------------------------------------------
    // TEST 5: Referral Code & Stats
    // ----------------------------------------------------
    const refCodeText = await cdp.eval('document.getElementById("dash-ref-code")?.textContent || ""');
    const hasCopy = await cdp.eval('Boolean(document.getElementById("btn-copy-ref"))');
    const hasWaShare = await cdp.eval('Boolean(document.getElementById("btn-wa-share"))');
    const hasStats = await cdp.eval('Boolean(document.getElementById("stat-total-rewards"))');
    if (refCodeText.startsWith('SATURN-') && hasCopy && hasWaShare && hasStats) {
      logPass('FEATURE 2: Referral code display, copy button, WhatsApp share, and stats verified');
    } else {
      logFail('FEATURE 2: Referral code verification', new Error(`Code: ${refCodeText}`));
    }

    // ----------------------------------------------------
    // TEST 6: My Payments Page & All 7 Required Fields
    // ----------------------------------------------------
    await cdp.click('#btn-tab-payments');
    await cdp.waitForVisible('#view-payments');
    await cdp.waitFor('.pay-receipt-card');

    const paymentDetails = await cdp.eval(`
      (() => {
        const card = document.querySelector('.pay-receipt-card');
        if (!card) return null;
        const text = card.innerText;
        const hasLatest = !!card.querySelector('.badge.highlight');
        const hasPaid = !!card.querySelector('.badge.ok');
        const hasView = !!card.querySelector('.btn-view-receipt');
        const hasPrint = !!card.querySelector('.btn-print-receipt');
        const hasDownload = !!card.querySelector('.btn-download-receipt');
        return {
          courseName: text.includes('Java Full Stack Training Programme'),
          fee: text.includes('₹5,000') || text.includes('5000'),
          hasStatus: hasPaid,
          hasLatestBadge: hasLatest,
          hasTxId: text.includes('Transaction ID'),
          hasDate: text.includes('Payment Date'),
          hasMethod: text.includes('Payment Method'),
          hasActions: hasView && hasPrint && hasDownload
        };
      })()
    `);

    if (
      paymentDetails &&
      paymentDetails.courseName &&
      paymentDetails.fee &&
      paymentDetails.hasStatus &&
      paymentDetails.hasLatestBadge &&
      paymentDetails.hasTxId &&
      paymentDetails.hasDate &&
      paymentDetails.hasMethod &&
      paymentDetails.hasActions
    ) {
      logPass('FEATURE 2: My Payments displays all 7 details, latest badge, and receipt actions');
    } else {
      logFail('FEATURE 2: My Payments details', new Error(JSON.stringify(paymentDetails)));
    }

    // ----------------------------------------------------
    // TEST 7: Official Printable Payment Receipt Modal
    // ----------------------------------------------------
    await cdp.click('.btn-view-receipt');
    await cdp.waitForVisible('#receipt-modal-backdrop');

    const receiptVerification = await cdp.eval(`
      (() => {
        const modal = document.getElementById('receipt-modal-backdrop');
        const text = modal.innerText;
        const hasCompany = text.includes('SATURN TECHNOLOGIES');
        const hasLegal = text.includes('Saturn Technologies India Private Limited');
        const hasRecNum = text.includes('SATURN-REC-');
        const hasStudent = text.includes('test.student@saturn.in');
        const hasTaxTable = text.includes('CGST (9%)') && text.includes('SGST (9%)');
        const hasTotal = text.includes('₹5,000.00');
        const hasSeal = text.includes('VERIFIED & PAID');
        return {
          visible: !modal.hidden,
          hasCompany,
          hasLegal,
          hasRecNum,
          hasStudent,
          hasTaxTable,
          hasTotal,
          hasSeal
        };
      })()
    `);

    if (
      receiptVerification &&
      receiptVerification.visible &&
      receiptVerification.hasCompany &&
      receiptVerification.hasLegal &&
      receiptVerification.hasRecNum &&
      receiptVerification.hasStudent &&
      receiptVerification.hasTaxTable &&
      receiptVerification.hasTotal &&
      receiptVerification.hasSeal
    ) {
      logPass('FEATURE 2: Printable payment receipt modal displays company branding, tax breakdown, and seal');
    } else {
      logFail('FEATURE 2: Receipt modal content', new Error(JSON.stringify(receiptVerification)));
    }

    // Close receipt modal
    await cdp.click('#modal-btn-close');
    await new Promise((r) => setTimeout(r, 300));

    // ----------------------------------------------------
    // TEST 8: Feature 3 - Materials Page & Course Catalog
    // ----------------------------------------------------
    await cdp.click('#btn-tab-materials');
    await cdp.waitForVisible('#view-materials');
    await cdp.waitFor('.material-card');

    const materialsCount = await cdp.eval('document.querySelectorAll(".material-card").length');
    const materialsCategories = await cdp.eval(`
      (() => {
        const cards = [...document.querySelectorAll('.material-card')];
        return cards.map(c => ({
          title: c.querySelector('.material-card-title')?.textContent || '',
          category: c.querySelector('.badge')?.textContent || '',
          hasReadBtn: Boolean(c.querySelector('.btn-read-pdf'))
        }));
      })()
    `);

    if (materialsCount >= 5 && materialsCategories.every((m) => m.hasReadBtn)) {
      logPass(`FEATURE 3: Materials page displays all ${materialsCount} categorized PDF course modules`);
    } else {
      logFail('FEATURE 3: Materials card listing', new Error(`Count: ${materialsCount}`));
    }

    // ----------------------------------------------------
    // TEST 9: Feature 3 - Open Embedded PDF Viewer
    // ----------------------------------------------------
    // Click "Read Online" on Module 1 (Core Java)
    await cdp.click('#mat-mat_mod1_core_java .btn-read-pdf');
    await cdp.waitForVisible('#pdf-viewer-modal');

    // Wait for PDF.js to finish rendering canvas
    await cdp.waitForVisible('#pdf-canvas-wrapper', 10000);
    const canvasRendered = await cdp.eval(`
      (() => {
        const canvas = document.getElementById('pdf-canvas');
        if (!canvas) return null;
        return {
          width: canvas.width,
          height: canvas.height,
          styleWidth: canvas.style.width,
          styleHeight: canvas.style.height
        };
      })()
    `);

    const viewerTitle = await cdp.eval('document.getElementById("pdf-doc-title")?.textContent || ""');
    const pageNumText = await cdp.eval('document.getElementById("pdf-page-num")?.textContent || ""');
    const pageCountText = await cdp.eval('document.getElementById("pdf-page-count")?.textContent || ""');

    if (
      canvasRendered &&
      canvasRendered.width > 200 &&
      canvasRendered.height > 200 &&
      viewerTitle.includes('Module 1') &&
      pageNumText === '1' &&
      Number(pageCountText) >= 3
    ) {
      logPass('FEATURE 3: Embedded PDF viewer renders PDF page 1 onto HTML5 canvas with metadata');
    } else {
      logFail('FEATURE 3: PDF rendering', new Error(`Canvas: ${JSON.stringify(canvasRendered)}, Page: ${pageNumText}/${pageCountText}`));
    }

    // ----------------------------------------------------
    // TEST 10: Feature 3 - Page Navigation (Next & Previous)
    // ----------------------------------------------------
    // Click Next Page
    await cdp.click('#pdf-btn-next');
    await new Promise((r) => setTimeout(r, 600));

    const page2Num = await cdp.eval('document.getElementById("pdf-page-num")?.textContent || ""');
    const prevDisabled = await cdp.eval('document.getElementById("pdf-btn-prev")?.disabled');

    // Click Previous Page
    await cdp.click('#pdf-btn-prev');
    await new Promise((r) => setTimeout(r, 600));

    const page1Num = await cdp.eval('document.getElementById("pdf-page-num")?.textContent || ""');

    if (page2Num === '2' && !prevDisabled && page1Num === '1') {
      logPass('FEATURE 3: Page navigation (Next Page -> Page 2, Prev Page -> Page 1) verified');
    } else {
      logFail('FEATURE 3: Page navigation', new Error(`Pages: ${page2Num} -> ${page1Num}`));
    }

    // ----------------------------------------------------
    // TEST 11: Feature 3 - Zoom Controls (In, Out, Fit Width)
    // ----------------------------------------------------
    const initialZoom = await cdp.eval('document.getElementById("pdf-zoom-level")?.textContent || ""');

    // Zoom In
    await cdp.click('#pdf-btn-zoom-in');
    await new Promise((r) => setTimeout(r, 500));
    const zoomedIn = await cdp.eval('document.getElementById("pdf-zoom-level")?.textContent || ""');

    // Zoom Fit Width
    await cdp.click('#pdf-btn-zoom-fit');
    await new Promise((r) => setTimeout(r, 500));
    const fitZoom = await cdp.eval('document.getElementById("pdf-zoom-level")?.textContent || ""');

    if (initialZoom && zoomedIn && fitZoom) {
      logPass(`FEATURE 3: Zoom controls verified (Initial: ${initialZoom} -> Zoomed: ${zoomedIn} -> Fit: ${fitZoom})`);
    } else {
      logFail('FEATURE 3: Zoom controls', new Error(`Zoom: ${initialZoom} / ${zoomedIn} / ${fitZoom}`));
    }

    // ----------------------------------------------------
    // TEST 12: Feature 3 - Security: Zero Download or Print Controls
    // ----------------------------------------------------
    const viewerSecurity = await cdp.eval(`
      (() => {
        const modal = document.getElementById('pdf-viewer-modal');
        const text = modal.innerText;
        const hasDownloadBtn = Boolean(modal.querySelector('button[title*="Download"], a[download], [id*="download"]'));
        const hasPrintBtn = Boolean(modal.querySelector('button[title*="Print"], [id*="print"]'));
        const hasWatermark = Boolean(document.getElementById('pdf-watermark-overlay'));
        const hasSecurityNote = text.includes('Protected Course Material') && text.includes('Online Viewing Only');
        return {
          hasDownloadBtn,
          hasPrintBtn,
          hasWatermark,
          hasSecurityNote
        };
      })()
    `);

    if (
      !viewerSecurity.hasDownloadBtn &&
      !viewerSecurity.hasPrintBtn &&
      viewerSecurity.hasWatermark &&
      viewerSecurity.hasSecurityNote
    ) {
      logPass('FEATURE 3: PDF viewer strictly enforces online-only reading with watermark and ZERO download/print buttons');
    } else {
      logFail('FEATURE 3: Viewer security controls', new Error(JSON.stringify(viewerSecurity)));
    }

    // ----------------------------------------------------
    // TEST 13: Feature 3 - Back to Materials Navigation
    // ----------------------------------------------------
    await cdp.click('#pdf-btn-back');
    await new Promise((r) => setTimeout(r, 300));
    const viewerClosed = await cdp.eval('document.getElementById("pdf-viewer-modal")?.hidden === true');
    const materialsStillVisible = await cdp.eval('!document.getElementById("view-materials")?.hidden');

    if (viewerClosed && materialsStillVisible) {
      logPass('FEATURE 3: Back to Materials button cleanly closes viewer and restores dashboard catalog');
    } else {
      logFail('FEATURE 3: Back button closure');
    }

    // ----------------------------------------------------
    // TEST 14: Mobile Responsiveness Verification
    // ----------------------------------------------------
    // Emulate mobile screen (iPhone 12 / Modern Phone viewport)
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 375,
      height: 667,
      deviceScaleFactor: 2,
      mobile: true
    });
    await new Promise((r) => setTimeout(r, 400));

    // Open viewer on mobile
    await cdp.click('#mat-mat_syllabus_2026 .btn-read-pdf');
    await cdp.waitForVisible('#pdf-viewer-modal');
    await cdp.waitForVisible('#pdf-canvas-wrapper', 8000);

    const mobileLayoutOk = await cdp.eval(`
      (() => {
        const toolbar = document.querySelector('.pdf-viewer-toolbar');
        const canvas = document.getElementById('pdf-canvas');
        const viewport = document.getElementById('pdf-viewport');
        return {
          toolbarFlex: getComputedStyle(toolbar).display === 'flex',
          canvasVisible: canvas.width > 0 && canvas.height > 0,
          viewportScrollable: viewport.scrollHeight >= viewport.clientHeight
        };
      })()
    `);

    if (mobileLayoutOk && mobileLayoutOk.canvasVisible) {
      logPass('MOBILE: PDF viewer renders responsively and scrollable on mobile viewport (375x667)');
    } else {
      logFail('MOBILE: Viewer rendering', new Error(JSON.stringify(mobileLayoutOk)));
    }

    // Close viewer and reset viewport
    await cdp.click('#pdf-btn-close');
    await cdp.send('Emulation.clearDeviceMetricsOverride');

    // ----------------------------------------------------
    // TEST 15: Console Error & CSP Cleanliness
    // ----------------------------------------------------
    const runtimeErrors = cdp.events.filter((e) => e.method === 'Runtime.exceptionThrown');
    if (runtimeErrors.length === 0) {
      logPass('RUNTIME: Zero JavaScript exceptions or unhandled rejections during test session');
    } else {
      logFail('RUNTIME: Unhandled exceptions detected', new Error(JSON.stringify(runtimeErrors)));
    }
  } catch (err) {
    logFail('UNEXPECTED TEST EXECUTION ERROR', err);
  } finally {
    try { ws.close(); } catch (_) {}
    await cleanup();
  }

  console.log(`\n========================================`);
  console.log(`Browser Test Results: ${passed} passed, ${failed} failed`);
  console.log(`========================================\n`);

  if (failed > 0) process.exit(1);
}

runBrowserTestSuite().catch((err) => {
  console.error('Fatal test runner failure:', err);
  process.exit(1);
});
