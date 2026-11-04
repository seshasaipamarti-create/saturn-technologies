/**
 * Saturn Technologies: Student Portal & Course Payment.
 * Pure Vanilla JS, zero dependencies, adheres to strict Content Security Policy.
 */
(function () {
  'use strict';

  // ==========================================
  // 1. REGISTRATION & LOGIN PAGE BEHAVIOUR
  // ==========================================
  var signupForm = document.getElementById('student-signup-form');
  var loginForm = document.getElementById('student-login-form');
  var tabBtnSignup = document.getElementById('tab-btn-signup');
  var tabBtnLogin = document.getElementById('tab-btn-login');
  var panelSignup = document.getElementById('panel-signup');
  var panelLogin = document.getElementById('panel-login');
  var linkToLogin = document.getElementById('link-to-login');
  var linkToSignup = document.getElementById('link-to-signup');

  function switchTab(target) {
    if (!tabBtnSignup || !tabBtnLogin || !panelSignup || !panelLogin) return;

    var isSignup = target === 'signup';
    tabBtnSignup.classList.toggle('active', isSignup);
    tabBtnSignup.setAttribute('aria-selected', String(isSignup));
    panelSignup.hidden = !isSignup;

    tabBtnLogin.classList.toggle('active', !isSignup);
    tabBtnLogin.setAttribute('aria-selected', String(!isSignup));
    panelLogin.hidden = isSignup;

    var activeInput = isSignup
      ? document.getElementById('reg-email')
      : document.getElementById('login-email');
    if (activeInput) {
      setTimeout(function () {
        activeInput.focus();
      }, 50);
    }
  }

  if (tabBtnSignup && tabBtnLogin) {
    tabBtnSignup.addEventListener('click', function () {
      switchTab('signup');
    });
    tabBtnLogin.addEventListener('click', function () {
      switchTab('login');
    });
    if (linkToLogin) {
      linkToLogin.addEventListener('click', function (e) {
        e.preventDefault();
        switchTab('login');
      });
    }
    if (linkToSignup) {
      linkToSignup.addEventListener('click', function (e) {
        e.preventDefault();
        switchTab('signup');
      });
    }

    var wantedTab = new URLSearchParams(window.location.search).get('tab');
    if (wantedTab === 'login') {
      switchTab('login');
    } else {
      switchTab('signup');
    }
  }

  function setFieldError(form, name, msg) {
    var input = form.elements[name];
    if (!input) return;
    var field = input.closest('.field');
    if (!field) return;
    var err = field.querySelector('.err');

    if (!msg) {
      if (err) err.remove();
      input.removeAttribute('aria-invalid');
      input.removeAttribute('aria-describedby');
      return;
    }

    if (!err) {
      err = document.createElement('p');
      err.className = 'err';
      err.id = 'err-' + form.id + '-' + name;
      field.appendChild(err);
    }
    err.textContent = msg;
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', err.id);
  }

  function setStatus(statusEl, kind, msg) {
    if (!statusEl) return;
    statusEl.className = 'form-status ' + (kind || '');
    statusEl.textContent = msg || '';
  }

  // --- Sign Up Form Submission ---
  if (signupForm) {
    var regStatus = document.getElementById('reg-status');
    var regSubmit = document.getElementById('reg-submit');
    var regSubmitHtml = regSubmit.innerHTML;

    var signupRules = {
      email: function (v) {
        return /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i.test(v.trim())
          ? ''
          : 'Please enter a valid email address.';
      },
      contactNumber: function (v) {
        var d = v.replace(/\D/g, '');
        return /^[+\d][\d\s()\-+]*$/.test(v.trim()) && d.length >= 8 && d.length <= 15
          ? ''
          : 'Please enter a valid phone number (8 to 15 digits).';
      },
      collegeName: function (v) {
        return v.trim().length >= 2 ? '' : 'Please enter your college name.';
      },
      academicYear: function (v) {
        return v.trim() ? '' : 'Please select your current academic year.';
      },
      degree: function (v) {
        return v.trim().length >= 2 ? '' : 'Please enter your degree / class.';
      },
      password: function (v) {
        return v.length >= 8 ? '' : 'Password must be at least 8 characters long.';
      },
      confirmPassword: function (v) {
        var pass = signupForm.elements.password ? signupForm.elements.password.value : '';
        return v === pass ? '' : 'Passwords do not match.';
      }
    };

    Object.keys(signupRules).forEach(function (n) {
      var el = signupForm.elements[n];
      if (!el) return;
      el.addEventListener('blur', function () {
        setFieldError(signupForm, n, signupRules[n](el.value));
      });
      el.addEventListener('input', function () {
        if (el.getAttribute('aria-invalid')) {
          setFieldError(signupForm, n, signupRules[n](el.value));
        }
      });
    });

    signupForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var firstInvalid = null;

      Object.keys(signupRules).forEach(function (n) {
        var val = signupForm.elements[n] ? signupForm.elements[n].value : '';
        var err = signupRules[n](val);
        setFieldError(signupForm, n, err);
        if (err && !firstInvalid) {
          firstInvalid = signupForm.elements[n];
        }
      });

      if (firstInvalid) {
        setStatus(regStatus, 'bad', 'Please correct the highlighted fields.');
        firstInvalid.focus();
        return;
      }

      var payload = {
        action: 'register',
        email: signupForm.elements.email.value.trim(),
        contactNumber: signupForm.elements.contactNumber.value.trim(),
        collegeName: signupForm.elements.collegeName.value.trim(),
        academicYear: signupForm.elements.academicYear.value.trim(),
        degree: signupForm.elements.degree.value.trim(),
        password: signupForm.elements.password.value,
        confirmPassword: signupForm.elements.confirmPassword.value
      };

      regSubmit.disabled = true;
      regSubmit.textContent = 'Registering…';
      setStatus(regStatus, '', '');

      fetch('/api/student', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload)
      })
        .then(function (r) {
          return r.json().catch(function () {
            return {};
          }).then(function (data) {
            return { status: r.status, ok: r.ok, body: data };
          });
        })
        .then(function (res) {
          if (res.ok && res.body && res.body.ok) {
            if (res.body.token) {
              try {
                localStorage.setItem('saturn_student_token', res.body.token);
              } catch (_) {}
            }
            signupForm.reset();
            setStatus(
              regStatus,
              'ok',
              res.body.message || 'Registration successful! Proceeding to course registration…'
            );

            // Redirect new student directly to Course Registration page
            setTimeout(function () {
              window.location.href = '/training/course-registration';
            }, 800);
          } else {
            if (res.body && res.body.errors) {
              Object.keys(res.body.errors).forEach(function (k) {
                setFieldError(signupForm, k, res.body.errors[k]);
              });
            }
            setStatus(
              regStatus,
              'bad',
              (res.body && res.body.message) || 'Registration failed. Please try again.'
            );
          }
        })
        .catch(function () {
          setStatus(regStatus, 'bad', 'Could not connect to the server. Please try again.');
        })
        .then(function () {
          regSubmit.disabled = false;
          regSubmit.innerHTML = regSubmitHtml;
        });
    });
  }

  // --- Login Form Submission ---
  if (loginForm) {
    var loginStatus = document.getElementById('login-status');
    var loginSubmit = document.getElementById('login-submit');
    var loginSubmitHtml = loginSubmit.innerHTML;

    loginForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var emailEl = loginForm.elements.email;
      var passEl = loginForm.elements.password;

      var emailVal = emailEl ? emailEl.value.trim() : '';
      var passVal = passEl ? passEl.value : '';

      setFieldError(loginForm, 'email', emailVal ? '' : 'Please enter your registered email.');
      setFieldError(loginForm, 'password', passVal ? '' : 'Please enter your password.');

      if (!emailVal || !passVal) {
        setStatus(loginStatus, 'bad', 'Please enter both your email and password.');
        if (!emailVal && emailEl) emailEl.focus();
        else if (!passVal && passEl) passEl.focus();
        return;
      }

      loginSubmit.disabled = true;
      loginSubmit.textContent = 'Logging in…';
      setStatus(loginStatus, '', '');

      var payload = {
        action: 'login',
        email: emailVal,
        password: passVal
      };

      fetch('/api/student', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload)
      })
        .then(function (r) {
          return r.json().catch(function () {
            return {};
          }).then(function (data) {
            return { status: r.status, ok: r.ok, body: data };
          });
        })
        .then(function (res) {
          if (res.ok && res.body && res.body.ok) {
            if (res.body.token) {
              try {
                localStorage.setItem('saturn_student_token', res.body.token);
              } catch (_) {}
            }
            setStatus(loginStatus, 'ok', res.body.message || 'Login successful. Redirecting…');

            // If student has paid: Student Dashboard; If not yet paid: Course Registration
            var target = res.body.isPaid ? '/training/dashboard' : '/training/course-registration';
            setTimeout(function () {
              window.location.href = target;
            }, 600);
          } else {
            setStatus(
              loginStatus,
              'bad',
              (res.body && res.body.message) || 'Invalid email or password.'
            );
          }
        })
        .catch(function () {
          setStatus(loginStatus, 'bad', 'Could not reach the server. Please check your connection.');
        })
        .then(function () {
          loginSubmit.disabled = false;
          loginSubmit.innerHTML = loginSubmitHtml;
        });
    });
  }

  // ==========================================
  // 2. DASHBOARD BEHAVIOUR & AUTHENTICATION GUARD
  // ==========================================
  var dashContainer = document.getElementById('dashboard-container');
  if (dashContainer) {
    var dashEmail = document.getElementById('dash-email');
    var dashMeta = document.getElementById('dash-meta');
    var btnTabReferral = document.getElementById('btn-tab-referral');
    var btnTabPayments = document.getElementById('btn-tab-payments');
    var btnTabMaterials = document.getElementById('btn-tab-materials');
    var viewReferral = document.getElementById('view-referral');
    var viewPayments = document.getElementById('view-payments');
    var viewMaterials = document.getElementById('view-materials');
    var btnLogout = document.getElementById('btn-logout');

    var token = null;
    try {
      token = localStorage.getItem('saturn_student_token');
    } catch (_) {}

    var headers = {};
    if (token) {
      headers.Authorization = 'Bearer ' + token;
    }

    // Verify session & paid status
    fetch('/api/student', { headers: headers, credentials: 'same-origin' })
      .then(function (r) {
        if (!r.ok) {
          throw new Error('Unauthenticated');
        }
        return r.json();
      })
      .then(function (data) {
        if (!data || !data.ok || !data.student) {
          throw new Error('Invalid session');
        }

        // Unpaid students cannot access paid dashboard features
        if (!data.isPaid) {
          window.location.replace('/training/course-registration');
          return;
        }

        var stu = data.student;
        if (dashEmail) dashEmail.textContent = stu.email;
        if (dashMeta) {
          var details = [stu.degree, stu.collegeName].filter(Boolean).join(' • ');
          dashMeta.textContent = details;
        }

        // Render Referral Code & Rewards (Feature 2)
        var ref = data.referral || {};
        var refCode = ref.referralCode || (stu && stu.referralCode) || '';
        var dashRefCode = document.getElementById('dash-ref-code');
        var btnCopyRef = document.getElementById('btn-copy-ref');
        var btnShareRef = document.getElementById('btn-share-ref');
        var btnWaShare = document.getElementById('btn-wa-share');
        var copyBtnLabel = document.getElementById('copy-btn-label');
        var refNoticeBox = document.getElementById('ref-notice-box');

        if (dashRefCode) {
          dashRefCode.textContent = refCode || 'Pending Payment';
        }

        var shareUrl = window.location.origin + '/training/course-registration' + (refCode ? '?ref=' + encodeURIComponent(refCode) : '');
        var shareMsg = 'Join me in the Java Full Stack Training Programme at Saturn Technologies! Register with my referral code ' + refCode + ': ' + shareUrl;

        if (btnWaShare) {
          btnWaShare.href = 'https://api.whatsapp.com/send?text=' + encodeURIComponent(shareMsg);
        }

        if (btnCopyRef) {
          btnCopyRef.addEventListener('click', function () {
            if (!refCode) return;
            var textToCopy = refCode;
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(textToCopy).then(showCopied).catch(fallbackCopy);
            } else {
              fallbackCopy();
            }

            function showCopied() {
              if (copyBtnLabel) copyBtnLabel.textContent = 'Copied!';
              setTimeout(function () {
                if (copyBtnLabel) copyBtnLabel.textContent = 'Copy Code';
              }, 2000);
            }

            function fallbackCopy() {
              var ta = document.createElement('textarea');
              ta.value = textToCopy;
              ta.style.position = 'fixed';
              ta.style.opacity = '0';
              document.body.appendChild(ta);
              ta.focus();
              ta.select();
              try {
                document.execCommand('copy');
                showCopied();
              } catch (_) {}
              document.body.removeChild(ta);
            }
          });
        }

        if (btnShareRef) {
          btnShareRef.addEventListener('click', function () {
            if (!refCode) return;
            if (navigator.share) {
              navigator.share({
                title: 'Saturn Technologies - Java Full Stack Training Programme',
                text: 'Join me in the Java Full Stack Training Programme! Use my referral code: ' + refCode,
                url: shareUrl
              }).catch(function () {});
            } else {
              var waUrl = 'https://api.whatsapp.com/send?text=' + encodeURIComponent(shareMsg);
              window.open(waUrl, '_blank', 'noopener,noreferrer');
            }
          });
        }

        // Stats cards
        var statTotalRefs = document.getElementById('stat-total-referrals');
        var statTotalRewards = document.getElementById('stat-total-rewards');
        var statWithdrawable = document.getElementById('stat-withdrawable-balance');

        if (statTotalRefs) statTotalRefs.textContent = String(ref.totalSuccessfulReferrals || 0);
        if (statTotalRewards) {
          statTotalRewards.textContent = '₹' + Number(ref.totalReferralRewards || 0).toLocaleString('en-IN');
        }
        if (statWithdrawable) {
          statWithdrawable.textContent = '₹' + Number(ref.withdrawableBalance || 0).toLocaleString('en-IN');
        }

        // Referral history table
        var refTableWrap = document.getElementById('ref-table-wrap');
        var refEmptyState = document.getElementById('ref-empty-state');
        var refTbody = document.getElementById('ref-history-tbody');
        var historyList = ref.history || [];

        if (refTbody && historyList.length > 0) {
          if (refTableWrap) refTableWrap.hidden = false;
          if (refEmptyState) refEmptyState.hidden = true;

          refTbody.innerHTML = historyList.map(function (item) {
            var dateStr = new Date(item.date).toLocaleDateString('en-IN', {
              year: 'numeric',
              month: 'short',
              day: 'numeric'
            });

            var badgeClass = 'uncredited';
            var badgeText = 'Money Uncredited';
            if (item.status === 'REFERRAL SUCCESSFULLY CREDITED') {
              badgeClass = 'credited';
              badgeText = 'Successfully Credited';
            } else if (item.status === 'REFERRAL CLAIM IN PROCESS') {
              badgeClass = 'in-process';
              badgeText = 'Claim In Process';
            }

            var subDetail = [item.referredDegree, item.referredCollege].filter(Boolean).join(' • ');

            return (
              '<tr>' +
              '<td>' +
              '<div class="ref-student-meta">' +
              '<span class="ref-student-id">' + (item.referredIdentifier || 'Student') + '</span>' +
              (subDetail ? '<span class="ref-student-sub">' + subDetail + '</span>' : '') +
              '</div>' +
              '</td>' +
              '<td>' + dateStr + '</td>' +
              '<td><strong>₹' + Number(item.rewardAmount || 1000).toLocaleString('en-IN') + '</strong></td>' +
              '<td><span class="badge ' + badgeClass + '">' + badgeText + '</span></td>' +
              '</tr>'
            );
          }).join('');
        } else {
          if (refTableWrap) refTableWrap.hidden = true;
          if (refEmptyState) refEmptyState.hidden = false;
        }

        // Render My Payments transaction history (Feature 2)
        var paymentsArea = document.getElementById('payments-history-area');
        var modalBackdrop = document.getElementById('receipt-modal-backdrop');
        var modalBtnClose = document.getElementById('modal-btn-close');
        var modalBtnPrint = document.getElementById('modal-btn-print');
        var modalBtnDownload = document.getElementById('modal-btn-download');

        function populateReceipt(payment) {
          var dateStr = new Date(payment.timestamp).toLocaleDateString('en-IN', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });

          var elNum = document.getElementById('r-number');
          var elDate = document.getElementById('r-date');
          var elEmail = document.getElementById('r-student-email');
          var elMeta = document.getElementById('r-student-meta');
          var elPhone = document.getElementById('r-student-phone');
          var elPayId = document.getElementById('r-payment-id');
          var elOrderId = document.getElementById('r-order-id');
          var elMethod = document.getElementById('r-method');
          var elCourse = document.getElementById('r-course-name');

          if (elNum) elNum.textContent = payment.receiptNumber || ('SATURN-REC-2026-' + (payment.orderId ? payment.orderId.replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase() : '0001'));
          if (elDate) elDate.textContent = dateStr;
          if (elEmail) elEmail.textContent = stu.email;
          if (elMeta) elMeta.textContent = [stu.degree, stu.collegeName].filter(Boolean).join(' • ') || 'Saturn Technologies Student';
          if (elPhone) elPhone.textContent = stu.contactNumber ? 'Contact: +91 ' + stu.contactNumber : '';
          if (elPayId) elPayId.textContent = payment.cfPaymentId || payment.id || '-';
          if (elOrderId) elOrderId.textContent = payment.orderId || '-';
          if (elMethod) elMethod.textContent = payment.method || 'Online / UPI';
          if (elCourse) elCourse.textContent = payment.courseName || 'Java Full Stack Training Programme';
        }

        function openReceiptModal(payment) {
          if (!modalBackdrop || !payment || payment.status !== 'PAID') return;
          populateReceipt(payment);
          modalBackdrop.hidden = false;
        }

        function closeReceiptModal() {
          if (modalBackdrop) modalBackdrop.hidden = true;
        }

        function printReceipt(payment) {
          if (!payment || payment.status !== 'PAID') return;
          populateReceipt(payment);
          window.print();
        }

        if (modalBtnClose) modalBtnClose.addEventListener('click', closeReceiptModal);
        if (modalBackdrop) {
          modalBackdrop.addEventListener('click', function (e) {
            if (e.target === modalBackdrop) closeReceiptModal();
          });
        }
        if (modalBtnPrint) {
          modalBtnPrint.addEventListener('click', function () {
            window.print();
          });
        }
        if (modalBtnDownload) {
          modalBtnDownload.addEventListener('click', function () {
            window.print();
          });
        }

        if (paymentsArea && data.payments && data.payments.length > 0) {
          paymentsArea.innerHTML = data.payments
            .map(function (p, index) {
              var isLatest = index === 0;
              var isPaid = p.status === 'PAID';
              var isPending = p.status === 'PENDING';
              var isFailed = p.status === 'FAILED';

              var dateStr = new Date(p.timestamp).toLocaleDateString('en-IN', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              });

              var badgeHtml = isPaid
                ? '<span class="badge ok">Successful</span>'
                : isPending
                ? '<span class="badge pending">Pending</span>'
                : '<span class="badge err">Failed</span>';

              var statusLabel = isPaid
                ? 'Successful (Verified)'
                : isPending
                ? 'Pending Confirmation'
                : 'Failed';

              var actionsHtml = '';
              if (isPaid) {
                actionsHtml =
                  '<div class="pay-receipt-actions no-print">' +
                  '<button type="button" class="btn sm btn-view-receipt" data-id="' + p.id + '">' +
                  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10M6 10h10"/></svg> View Receipt' +
                  '</button>' +
                  '<button type="button" class="btn sm outline btn-print-receipt" data-id="' + p.id + '" title="Print official receipt">' +
                  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg> Print' +
                  '</button>' +
                  '<button type="button" class="btn sm outline btn-download-receipt" data-id="' + p.id + '" title="Download printable receipt as PDF">' +
                  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg> Download PDF' +
                  '</button>' +
                  '</div>';
              } else if (isPending) {
                actionsHtml =
                  '<div class="pay-receipt-actions no-print">' +
                  '<p class="pay-attempt-note">Payment is awaiting confirmation from Cashfree. Receipt will be generated once verified.</p>' +
                  '<a class="btn sm" href="/training/course-registration">Check Registration</a>' +
                  '</div>';
              } else {
                actionsHtml =
                  '<div class="pay-receipt-actions no-print">' +
                  '<p class="pay-attempt-note bad">This transaction attempt failed or expired. No receipt was issued.</p>' +
                  '<a class="btn sm outline" href="/training/course-registration">Retry Payment</a>' +
                  '</div>';
              }

              return (
                '<div class="pay-receipt-card">' +
                '<div class="pay-card-header">' +
                '<h3>' + (p.courseName || 'Java Full Stack Training Programme') + '</h3>' +
                '<div class="pay-badges">' +
                (isLatest ? '<span class="badge highlight">Latest Payment</span>' : '') +
                badgeHtml +
                '</div>' +
                '</div>' +
                '<div class="pay-receipt-grid">' +
                '<div class="pay-receipt-item"><small>Total Course Fee</small><span>₹' +
                Number(p.amount || 5000).toLocaleString('en-IN') + ' ' + (p.currency || 'INR') +
                '</span></div>' +
                '<div class="pay-receipt-item"><small>Payment Status</small><span>' +
                statusLabel +
                '</span></div>' +
                '<div class="pay-receipt-item"><small>Transaction ID</small><span>' +
                (p.cfPaymentId || p.id || '-') +
                '</span></div>' +
                '<div class="pay-receipt-item"><small>Order ID</small><span>' +
                (p.orderId || '-') +
                '</span></div>' +
                '<div class="pay-receipt-item"><small>Payment Date &amp; Time</small><span>' +
                dateStr +
                '</span></div>' +
                '<div class="pay-receipt-item"><small>Payment Method</small><span>' +
                (p.method || 'Online') +
                '</span></div>' +
                '</div>' +
                actionsHtml +
                '</div>'
              );
            })
            .join('');

          paymentsArea.addEventListener('click', function (e) {
            var btnView = e.target.closest('.btn-view-receipt');
            var btnPrint = e.target.closest('.btn-print-receipt');
            var btnDownload = e.target.closest('.btn-download-receipt');

            if (btnView) {
              var pid = btnView.getAttribute('data-id');
              var item = data.payments.find(function (p) { return p.id === pid; });
              if (item) openReceiptModal(item);
            } else if (btnPrint || btnDownload) {
              var pid = (btnPrint || btnDownload).getAttribute('data-id');
              var item = data.payments.find(function (p) { return p.id === pid; });
              if (item) printReceipt(item);
            }
          });
        }

        // ----------------------------------------------------
        // FEATURE 3: ONLINE PDF MATERIALS & EMBEDDED VIEWER
        // ----------------------------------------------------
        var materialsGrid = document.getElementById('materials-grid');
        var materialsEmptyCard = document.getElementById('materials-empty-card');
        var pdfViewerModal = document.getElementById('pdf-viewer-modal');
        var pdfDocTitle = document.getElementById('pdf-doc-title');
        var pdfDocCategory = document.getElementById('pdf-doc-category');
        var pdfBtnBack = document.getElementById('pdf-btn-back');
        var pdfBtnClose = document.getElementById('pdf-btn-close');
        var pdfBtnPrev = document.getElementById('pdf-btn-prev');
        var pdfBtnNext = document.getElementById('pdf-btn-next');
        var pdfPageNum = document.getElementById('pdf-page-num');
        var pdfPageCount = document.getElementById('pdf-page-count');
        var pdfBtnZoomOut = document.getElementById('pdf-btn-zoom-out');
        var pdfBtnZoomIn = document.getElementById('pdf-btn-zoom-in');
        var pdfBtnZoomFit = document.getElementById('pdf-btn-zoom-fit');
        var pdfZoomLevel = document.getElementById('pdf-zoom-level');
        var pdfViewport = document.getElementById('pdf-viewport');
        var pdfCanvasWrapper = document.getElementById('pdf-canvas-wrapper');
        var pdfCanvas = document.getElementById('pdf-canvas');
        var pdfLoading = document.getElementById('pdf-loading');
        var pdfError = document.getElementById('pdf-error');
        var pdfErrorMsg = document.getElementById('pdf-error-msg');
        var pdfBtnRetry = document.getElementById('pdf-btn-retry');

        var currentPdfDoc = null;
        var currentPdfPage = 1;
        var currentTotalPages = 1;
        var currentScale = 1.15;
        var isRendering = false;
        var renderTask = null;
        var activeMaterialId = null;
        var materialsList = data.materials || [];

        // Ensure PDF viewer modal starts strictly hidden on dashboard load
        if (pdfViewerModal) pdfViewerModal.hidden = true;

        function renderMaterialsList(items) {
          if (!materialsGrid) return;
          if (!items || items.length === 0) {
            materialsGrid.innerHTML = '';
            if (materialsEmptyCard) materialsEmptyCard.hidden = false;
            return;
          }
          if (materialsEmptyCard) materialsEmptyCard.hidden = true;

          materialsGrid.innerHTML = items.map(function (m) {
            return (
              '<article class="card material-card" id="mat-' + m.id + '">' +
                '<div class="material-card-content">' +
                  '<div class="material-card-head">' +
                    '<span class="badge">' + (m.category || 'Curriculum') + '</span>' +
                    '<span class="material-card-meta">' + (m.pageCount ? m.pageCount + ' pages' : 'PDF Document') + '</span>' +
                  '</div>' +
                  '<h3 class="material-card-title">' + m.title + '</h3>' +
                  '<p class="material-card-desc">' + m.description + '</p>' +
                '</div>' +
                '<div class="material-card-footer">' +
                  '<span class="badge ok sm">Online Reading Only</span>' +
                  '<button type="button" class="btn sm btn-read-pdf" data-id="' + m.id + '" aria-label="Read ' + m.title + ' online">' +
                    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10M6 10h10"/></svg> Read Online' +
                  '</button>' +
                '</div>' +
              '</article>'
            );
          }).join('');
        }

        if (materialsList.length > 0) {
          renderMaterialsList(materialsList);
        } else {
          fetch('/api/student?action=materials', { headers: headers, credentials: 'same-origin' })
            .then(function (r) { return r.json(); })
            .then(function (res) {
              if (res && res.ok && res.materials) {
                materialsList = res.materials;
                renderMaterialsList(materialsList);
              } else if (materialsEmptyCard) {
                materialsEmptyCard.hidden = false;
              }
            })
            .catch(function () {
              if (materialsEmptyCard) materialsEmptyCard.hidden = false;
            });
        }

        function calculateOptimalScale() {
          if (!pdfViewport) return 1.15;
          var availableWidth = pdfViewport.clientWidth - 48;
          var optimal = availableWidth / 595; // A4 standard width ~595pt
          return Math.min(2.0, Math.max(0.65, optimal));
        }

        function openPdfViewer(materialId) {
          var item = materialsList.find(function (m) { return m.id === materialId; });
          if (!item) return;

          activeMaterialId = materialId;
          if (pdfDocTitle) pdfDocTitle.textContent = item.title;
          if (pdfDocCategory) pdfDocCategory.textContent = item.category || 'Curriculum';
          if (pdfViewerModal) pdfViewerModal.hidden = false;
          document.body.style.overflow = 'hidden';

          currentPdfPage = 1;
          currentScale = calculateOptimalScale();
          loadPdfDocument(materialId);
        }

        function closePdfViewer() {
          if (pdfViewerModal) pdfViewerModal.hidden = true;
          document.body.style.overflow = '';
          if (renderTask) {
            try { renderTask.cancel(); } catch (_) {}
            renderTask = null;
          }
          currentPdfDoc = null;
          activeMaterialId = null;
        }

        function loadPdfDocument(materialId) {
          if (pdfLoading) pdfLoading.hidden = false;
          if (pdfError) pdfError.hidden = true;
          if (pdfCanvasWrapper) pdfCanvasWrapper.style.visibility = 'hidden';

          if (window.pdfjsLib && !window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/assets/vendor/pdfjs/pdf.worker.min.js';
          }

          fetch('/api/student?action=material-file&id=' + encodeURIComponent(materialId), {
            headers: headers,
            credentials: 'same-origin'
          })
            .then(function (r) {
              if (!r.ok) {
                throw new Error(r.status === 403 ? 'Payment required or access denied.' : 'Failed to retrieve document.');
              }
              return r.arrayBuffer();
            })
            .then(function (buffer) {
              if (!window.pdfjsLib) {
                throw new Error('PDF viewer library is initializing. Please try again.');
              }
              var uint8 = new Uint8Array(buffer);
              return window.pdfjsLib.getDocument({
                data: uint8,
                cMapUrl: '/assets/vendor/pdfjs/cmaps/',
                cMapPacked: true
              }).promise;
            })
            .then(function (doc) {
              currentPdfDoc = doc;
              currentTotalPages = doc.numPages;
              if (pdfPageCount) pdfPageCount.textContent = String(currentTotalPages);
              renderPage(1);
            })
            .catch(function (err) {
              if (pdfLoading) pdfLoading.hidden = true;
              if (pdfError) pdfError.hidden = false;
              if (pdfErrorMsg) pdfErrorMsg.textContent = err.message || 'Error loading course document.';
            });
        }

        function renderPage(pageNum) {
          if (!currentPdfDoc || isRendering) return;
          isRendering = true;

          currentPdfPage = pageNum;
          if (pdfLoading) pdfLoading.hidden = false;

          currentPdfDoc.getPage(pageNum).then(function (page) {
            var viewport = page.getViewport({ scale: currentScale });
            var canvas = pdfCanvas;
            if (!canvas) {
              isRendering = false;
              return;
            }

            var ctx = canvas.getContext('2d');
            var outputScale = window.devicePixelRatio || 1;
            canvas.width = Math.floor(viewport.width * outputScale);
            canvas.height = Math.floor(viewport.height * outputScale);
            canvas.style.width = Math.floor(viewport.width) + 'px';
            canvas.style.height = Math.floor(viewport.height) + 'px';

            var transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;

            var renderContext = {
              canvasContext: ctx,
              transform: transform,
              viewport: viewport
            };

            if (renderTask) {
              try { renderTask.cancel(); } catch (_) {}
            }

            renderTask = page.render(renderContext);
            renderTask.promise.then(function () {
              isRendering = false;
              if (pdfLoading) pdfLoading.hidden = true;
              if (pdfCanvasWrapper) pdfCanvasWrapper.style.visibility = 'visible';

              if (pdfPageNum) pdfPageNum.textContent = String(pageNum);
              if (pdfZoomLevel) pdfZoomLevel.textContent = Math.round(currentScale * 100) + '%';
              if (pdfBtnPrev) pdfBtnPrev.disabled = pageNum <= 1;
              if (pdfBtnNext) pdfBtnNext.disabled = pageNum >= currentTotalPages;

              if (pdfViewport) pdfViewport.scrollTop = 0;
            }).catch(function (err) {
              if (err && err.name === 'RenderingCancelledException') return;
              isRendering = false;
              if (pdfLoading) pdfLoading.hidden = true;
            });
          }).catch(function () {
            isRendering = false;
            if (pdfLoading) pdfLoading.hidden = true;
          });
        }

        // Event listeners for viewer controls
        if (pdfBtnPrev) {
          pdfBtnPrev.addEventListener('click', function () {
            if (currentPdfPage > 1 && !isRendering) renderPage(currentPdfPage - 1);
          });
        }
        if (pdfBtnNext) {
          pdfBtnNext.addEventListener('click', function () {
            if (currentPdfPage < currentTotalPages && !isRendering) renderPage(currentPdfPage + 1);
          });
        }
        if (pdfBtnZoomIn) {
          pdfBtnZoomIn.addEventListener('click', function () {
            if (isRendering) return;
            currentScale = Math.min(2.5, currentScale + 0.25);
            renderPage(currentPdfPage);
          });
        }
        if (pdfBtnZoomOut) {
          pdfBtnZoomOut.addEventListener('click', function () {
            if (isRendering) return;
            currentScale = Math.max(0.6, currentScale - 0.25);
            renderPage(currentPdfPage);
          });
        }
        if (pdfBtnZoomFit) {
          pdfBtnZoomFit.addEventListener('click', function () {
            if (isRendering) return;
            currentScale = calculateOptimalScale();
            renderPage(currentPdfPage);
          });
        }
        if (pdfBtnClose) pdfBtnClose.addEventListener('click', closePdfViewer);
        if (pdfBtnBack) pdfBtnBack.addEventListener('click', closePdfViewer);
        if (pdfBtnRetry) {
          pdfBtnRetry.addEventListener('click', function () {
            if (activeMaterialId) loadPdfDocument(activeMaterialId);
          });
        }

        // Delegate Read Online clicks from materials grid
        if (materialsGrid) {
          materialsGrid.addEventListener('click', function (e) {
            var btn = e.target.closest('.btn-read-pdf');
            if (btn) {
              var matId = btn.getAttribute('data-id');
              if (matId) openPdfViewer(matId);
            }
          });
        }

        // Security: Prevent context menu & intercept print shortcuts
        if (pdfViewerModal) {
          pdfViewerModal.addEventListener('contextmenu', function (e) {
            e.preventDefault();
            return false;
          });
        }

        window.addEventListener('keydown', function (e) {
          if (pdfViewerModal && !pdfViewerModal.hidden) {
            if (e.key === 'Escape') {
              closePdfViewer();
            } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
              if (currentPdfPage > 1 && !isRendering) {
                e.preventDefault();
                renderPage(currentPdfPage - 1);
              }
            } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
              if (currentPdfPage < currentTotalPages && !isRendering) {
                e.preventDefault();
                renderPage(currentPdfPage + 1);
              }
            } else if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
              e.preventDefault();
              e.stopPropagation();
              alert('Printing is disabled for protected course materials.');
              return false;
            } else if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
              e.preventDefault();
              e.stopPropagation();
              alert('Downloading is disabled for protected course materials.');
              return false;
            }
          }
        });
      })
      .catch(function () {
        try {
          localStorage.removeItem('saturn_student_token');
        } catch (_) {}
        window.location.replace('/training/register?tab=login');
      });

    // Sidebar navigation switching
    function showView(viewName) {
      var isReferral = viewName === 'referral';
      var isPayments = viewName === 'payments';
      var isMaterials = viewName === 'materials';

      if (btnTabReferral) {
        btnTabReferral.classList.toggle('active', isReferral);
        btnTabReferral.setAttribute('aria-current', isReferral ? 'page' : 'false');
      }
      if (btnTabPayments) {
        btnTabPayments.classList.toggle('active', isPayments);
        btnTabPayments.setAttribute('aria-current', isPayments ? 'page' : 'false');
      }
      if (btnTabMaterials) {
        btnTabMaterials.classList.toggle('active', isMaterials);
        btnTabMaterials.setAttribute('aria-current', isMaterials ? 'page' : 'false');
      }

      if (viewReferral) viewReferral.hidden = !isReferral;
      if (viewPayments) viewPayments.hidden = !isPayments;
      if (viewMaterials) viewMaterials.hidden = !isMaterials;
    }

    if (btnTabReferral) {
      btnTabReferral.addEventListener('click', function () {
        showView('referral');
      });
    }
    if (btnTabPayments) {
      btnTabPayments.addEventListener('click', function () {
        showView('payments');
      });
    }
    if (btnTabMaterials) {
      btnTabMaterials.addEventListener('click', function () {
        showView('materials');
      });
    }

    var initialTab = (new URLSearchParams(window.location.search)).get('tab') || window.location.hash.replace('#', '');
    if (initialTab === 'materials') {
      showView('materials');
    } else if (initialTab === 'payments') {
      showView('payments');
    }

    // Logout
    if (btnLogout) {
      btnLogout.addEventListener('click', function () {
        btnLogout.disabled = true;
        btnLogout.textContent = 'Logging out…';

        fetch('/api/student', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: 'Bearer ' + token } : {})
          },
          body: JSON.stringify({ action: 'logout' })
        })
          .catch(function () {})
          .then(function () {
            try {
              localStorage.removeItem('saturn_student_token');
            } catch (_) {}
            window.location.replace('/training/register?tab=login');
          });
      });
    }
  }

  // ==========================================
  // 3. COURSE REGISTRATION & PAYMENT PAGE
  // ==========================================
  var courseCard = document.getElementById('course-reg-card');
  if (courseCard) {
    var cToken = null;
    try {
      cToken = localStorage.getItem('saturn_student_token');
    } catch (_) {}

    var cHeaders = {};
    if (cToken) {
      cHeaders.Authorization = 'Bearer ' + cToken;
    }

    var payStatus = document.getElementById('course-pay-status');
    var btnCourseRegister = document.getElementById('btn-course-register');
    var btnValidateRef = document.getElementById('btn-validate-ref');
    var refInput = document.getElementById('course-ref-code');
    var refFeedback = document.getElementById('ref-feedback');

    // 1. Session check: user must be logged in; if already paid, redirect to dashboard
    fetch('/api/student', { headers: cHeaders, credentials: 'same-origin' })
      .then(function (r) {
        if (!r.ok) throw new Error('Unauthenticated');
        return r.json();
      })
      .then(function (data) {
        if (!data || !data.ok) throw new Error('Unauthenticated');
        if (data.isPaid) {
          window.location.replace('/training/dashboard');
          return;
        }

        // Check if returning from payment gateway (order_id in URL)
        var params = new URLSearchParams(window.location.search);
        var retOrderId = params.get('order_id');

        if (retOrderId) {
          if (btnCourseRegister) btnCourseRegister.disabled = true;
          setStatus(payStatus, 'ok', 'Verifying your payment with Cashfree…');

          var verifyUrl =
            '/api/cashfree?action=verify-order&order_id=' +
            encodeURIComponent(retOrderId);

          fetch(verifyUrl)
            .then(function (vr) {
              return vr.json();
            })
            .then(function (vData) {
              if (vData.ok && vData.status === 'PAID') {
                setStatus(
                  payStatus,
                  'ok',
                  'Payment confirmed! Redirecting to your Student Dashboard…'
                );
                setTimeout(function () {
                  window.location.href = '/training/dashboard';
                }, 1400);
              } else if (vData.status === 'PENDING') {
                setStatus(
                  payStatus,
                  'bad',
                  'Payment is currently pending confirmation. Please wait or refresh.'
                );
                if (btnCourseRegister) btnCourseRegister.disabled = false;
              } else {
                setStatus(
                  payStatus,
                  'bad',
                  vData.message || 'Payment could not be completed. You can retry below.'
                );
                if (btnCourseRegister) btnCourseRegister.disabled = false;
              }
            })
            .catch(function () {
              setStatus(payStatus, 'bad', 'Could not verify payment status. Please check your connection.');
              if (btnCourseRegister) btnCourseRegister.disabled = false;
            });
        }

        // Auto pre-fill referral code from share link ?ref=...
        var queryRef = params.get('ref');
        if (queryRef && refInput && !refInput.value) {
          refInput.value = queryRef.trim().toUpperCase();
          if (btnValidateRef) {
            setTimeout(function () {
              btnValidateRef.click();
            }, 100);
          }
        }
      })
      .catch(function () {
        window.location.replace('/training/register?tab=login');
      });

    // 2. Validate referral code
    if (btnValidateRef && refInput && refFeedback) {
      btnValidateRef.addEventListener('click', function () {
        var code = refInput.value.trim();
        if (!code) {
          refFeedback.className = 'ref-feedback bad';
          refFeedback.textContent = 'Please enter a referral code to apply.';
          return;
        }

        btnValidateRef.disabled = true;
        btnValidateRef.textContent = 'Checking…';
        refFeedback.className = 'ref-feedback';
        refFeedback.textContent = '';

        fetch('/api/student', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(cToken ? { Authorization: 'Bearer ' + cToken } : {})
          },
          body: JSON.stringify({ action: 'validate-referral', referralCode: code })
        })
          .then(function (r) {
            return r.json().catch(function () {
              return {};
            }).then(function (d) {
              return { ok: r.ok, body: d };
            });
          })
          .then(function (res) {
            if (res.ok && res.body && res.body.valid) {
              refFeedback.className = 'ref-feedback ok';
              refFeedback.textContent = '✓ ' + (res.body.message || 'Valid referral code applied.');
            } else {
              refFeedback.className = 'ref-feedback bad';
              refFeedback.textContent = '✗ ' + ((res.body && res.body.message) || 'Invalid referral code.');
            }
          })
          .catch(function () {
            refFeedback.className = 'ref-feedback bad';
            refFeedback.textContent = 'Could not validate referral code. Please check your connection.';
          })
          .then(function () {
            btnValidateRef.disabled = false;
            btnValidateRef.textContent = 'Apply Code';
          });
      });
    }

    // 3. Register for Course (Cashfree Payment Initiation)
    if (btnCourseRegister) {
      var origBtnHtml = btnCourseRegister.innerHTML;

      btnCourseRegister.addEventListener('click', function () {
        btnCourseRegister.disabled = true;
        btnCourseRegister.textContent = 'Processing Registration…';
        setStatus(payStatus, '', '');

        var referralCode = refInput ? refInput.value.trim() : '';

        fetch('/api/cashfree', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(cToken ? { Authorization: 'Bearer ' + cToken } : {})
          },
          body: JSON.stringify({
            action: 'create-order',
            referralCode: referralCode
          })
        })
          .then(function (r) {
            return r.json().catch(function () {
              return {};
            }).then(function (d) {
              return { ok: r.ok, status: r.status, body: d };
            });
          })
          .then(function (res) {
            if (res.ok && res.body && res.body.ok) {
              var orderData = res.body;

              // Launch Cashfree Drop JS SDK checkout
              if (typeof window.Cashfree === 'function' && orderData.paymentSessionId) {
                try {
                  var mode = (orderData.environment === 'production') ? 'production' : 'sandbox';
                  var cashfree = window.Cashfree({ mode: mode });
                  cashfree.checkout({
                    paymentSessionId: orderData.paymentSessionId,
                    redirectTarget: '_self'
                  });
                  return;
                } catch (sdkErr) {
                  console.error('[Cashfree Checkout Error]', sdkErr);
                  setStatus(
                    payStatus,
                    'bad',
                    'Payment checkout encountered an error. Please try again.'
                  );
                  btnCourseRegister.disabled = false;
                  btnCourseRegister.innerHTML = origBtnHtml;
                  return;
                }
              }

              // Graceful handling when Cashfree SDK is missing or failed to load
              setStatus(
                payStatus,
                'bad',
                'Payment gateway checkout could not be loaded. Please disable ad-blockers, check your internet connection, or refresh the page.'
              );
              btnCourseRegister.disabled = false;
              btnCourseRegister.innerHTML = origBtnHtml;
            } else {
              setStatus(
                payStatus,
                'bad',
                (res.body && res.body.message) || 'Could not initiate payment. Please try again.'
              );
              btnCourseRegister.disabled = false;
              btnCourseRegister.innerHTML = origBtnHtml;
            }
          })
          .catch(function () {
            setStatus(payStatus, 'bad', 'Network error connecting to payment gateway.');
            btnCourseRegister.disabled = false;
            btnCourseRegister.innerHTML = origBtnHtml;
          });
      });
    }
  }
})();
