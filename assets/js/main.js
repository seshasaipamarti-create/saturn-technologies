/* Saturn Technologies: site behaviour. No dependencies, no inline scripts (strict CSP). */
(function () {
  'use strict';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Old single-page links such as /#privacy now live on their own pages.
  var legacy = { '#privacy': '/privacy', '#terms': '/terms' };
  if (legacy[location.hash] && location.pathname === '/') { location.replace(legacy[location.hash]); return; }

  // ---------- mobile menu ----------
  var toggle = document.querySelector('.menu-toggle');
  var list = document.getElementById('site-nav');
  if (toggle && list) {
    var setOpen = function (open) {
      list.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    };
    toggle.addEventListener('click', function () { setOpen(!list.classList.contains('open')); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && list.classList.contains('open')) { setOpen(false); toggle.focus(); } });
    list.addEventListener('click', function (e) { if (e.target.closest('a')) setOpen(false); });
  }

  // ---------- reveal on scroll (content stays visible if JS or IntersectionObserver is unavailable) ----------
  var items = document.querySelectorAll('.reveal');
  if (items.length && 'IntersectionObserver' in window && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    items.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.92) return; // already on screen: leave visible
      el.classList.add('pre'); io.observe(el);
    });
  }

  // ---------- logo: ring and S drift slightly against each other under the cursor ----------
  if (!reduce) {
    document.querySelectorAll('.brand').forEach(function (b) {
      var m = b.querySelector('.mark'); if (!m) return;
      var clamp = function (v) { return Math.max(-1, Math.min(1, v)); };
      b.addEventListener('mousemove', function (e) {
        var r = m.getBoundingClientRect();
        m.style.setProperty('--mx', clamp((e.clientX - (r.left + r.width / 2)) / r.width * 2));
        m.style.setProperty('--my', clamp((e.clientY - (r.top + r.height / 2)) / r.height * 2));
      });
      b.addEventListener('mouseleave', function () { m.style.setProperty('--mx', 0); m.style.setProperty('--my', 0); });
    });
  }

  // ---------- enquiry form ----------
  var form = document.getElementById('enquiry-form');
  if (!form) return;
  var status = document.getElementById('form-status');
  var submit = document.getElementById('f-submit');
  var stamp = document.getElementById('f-t');
  var submitHtml = submit.innerHTML;
  stamp.value = String(Date.now());

  // /contact?service=website-development pre-selects the service
  var wanted = new URLSearchParams(location.search).get('service');
  var sel = document.getElementById('f-service');
  if (wanted && Array.prototype.some.call(sel.options, function (o) { return o.value === wanted; })) sel.value = wanted;

  var rules = {
    name: function (v) { return v.trim().length >= 2 ? '' : 'Please enter your full name.'; },
    email: function (v) { return /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i.test(v.trim()) ? '' : 'Please enter a valid email address.'; },
    phone: function (v) { var d = v.replace(/\D/g, ''); return /^[+\d][\d\s()\-+]*$/.test(v.trim()) && d.length >= 8 && d.length <= 15 ? '' : 'Please enter a valid phone number.'; },
    service: function (v) { return v ? '' : 'Please choose a service.'; },
    message: function (v) { return v.trim().length >= 20 ? '' : 'Please describe your project in at least 20 characters.'; }
  };

  function setError(name, msg) {
    var input = form.elements[name]; if (!input) return;
    var field = input.closest('.field');
    var err = field.querySelector('.err');
    if (!msg) { if (err) err.remove(); input.removeAttribute('aria-invalid'); input.removeAttribute('aria-describedby'); return; }
    if (!err) { err = document.createElement('p'); err.className = 'err'; err.id = 'err-' + name; field.appendChild(err); }
    err.textContent = msg;
    input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', err.id);
  }
  Object.keys(rules).forEach(function (n) {
    var el = form.elements[n];
    el.addEventListener('blur', function () { setError(n, rules[n](el.value)); });
    el.addEventListener('input', function () { if (el.getAttribute('aria-invalid')) setError(n, rules[n](el.value)); });
  });

  function say(kind, text) { status.className = 'form-status ' + kind; status.textContent = text; }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var first = null;
    Object.keys(rules).forEach(function (n) { var m = rules[n](form.elements[n].value); setError(n, m); if (m && !first) first = form.elements[n]; });
    if (first) { say('bad', 'Please correct the highlighted fields.'); first.focus(); return; }

    var data = {}; new FormData(form).forEach(function (v, k) { data[k] = v; });
    submit.disabled = true; submit.textContent = 'Sending…'; say('', '');

    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 20000);
    fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, body: j }; }); })
      .then(function (res) {
        if (res.body && res.body.ok) {
          form.reset(); stamp.value = String(Date.now());
          say('ok', res.body.message || 'Thank you. Your enquiry has been sent.');
        } else {
          if (res.body && res.body.errors) Object.keys(res.body.errors).forEach(function (k) { setError(k, res.body.errors[k]); });
          say('bad', (res.body && res.body.message) || 'Something went wrong. Please try again.');
        }
      })
      .catch(function () { say('bad', 'We could not reach the server. Please check your connection and try again.'); })
      .then(function () { clearTimeout(timer); submit.disabled = false; submit.innerHTML = submitHtml; status.focus && status.setAttribute('tabindex', '-1'); });
  });
})();
