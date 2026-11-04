'use strict';
const fs = require('fs');
const path = require('path');
const L = require('./lib');
const { cfg, services, hosting, faqs, work, testimonials, SITE, NAME, SHORT, esc, has, icon, contactItems, waLink, layout, pageHero, ctaBand, money } = L;
const training = JSON.parse(fs.readFileSync(path.join(L.root, 'content/training.json'), 'utf8'));

const sectionHead = (eyebrow, title, text, center = false) => `<div class="section-head${center ? ' center' : ''} reveal">
  <span class="eyebrow">${esc(eyebrow)}</span><h2>${esc(title)}</h2>${text ? `<p>${esc(text)}</p>` : ''}
</div>`;

// ---------- hero illustration (inline SVG, no external requests) ----------
function heroVisual() {
  const code = [[126, 134, 70, '#fc7705'], [140, 152, 112, '#5b8cc4'], [140, 170, 82, '#c7d4e8'], [154, 188, 122, '#5b8cc4'], [154, 206, 62, '#fc7705'], [140, 224, 98, '#c7d4e8'], [126, 242, 42, '#fc7705']];
  return `<svg viewBox="0 0 560 440" role="img" aria-label="Illustration of a web application dashboard encircled by an orbit ring" xmlns="http://www.w3.org/2000/svg">
  <circle cx="280" cy="224" r="176" fill="#0f4278" opacity=".35"/>
  <g fill="#fff" opacity=".55"><circle cx="58" cy="70" r="2"/><circle cx="498" cy="48" r="2.4"/><circle cx="520" cy="250" r="1.8"/><circle cx="44" cy="330" r="2"/><circle cx="470" cy="396" r="2"/><circle cx="150" cy="30" r="1.6"/></g>
  <g transform="translate(280 232) rotate(-14)"><path d="M-262 0A262 66 0 0 1 262 0" fill="none" stroke="#fc7705" stroke-width="5" stroke-linecap="round"/></g>
  <rect x="110" y="78" width="340" height="272" rx="16" fill="#0a2a52" stroke="#25568f" stroke-width="1.5"/>
  <path d="M110 94a16 16 0 0 1 16-16h308a16 16 0 0 1 16 16v20H110z" fill="#0f3a6b"/>
  <circle cx="130" cy="96" r="5" fill="#ff5f57"/><circle cx="147" cy="96" r="5" fill="#febc2e"/><circle cx="164" cy="96" r="5" fill="#28c840"/>
  <rect x="190" y="88" width="170" height="16" rx="8" fill="#0a2a52"/>
  ${code.map(([x, y, w, c]) => `<rect x="${x}" y="${y}" width="${w}" height="8" rx="4" fill="${c}" opacity=".9"/>`).join('')}
  <rect x="296" y="130" width="138" height="66" rx="10" fill="#123f73"/>
  <g fill="#5b8cc4"><rect x="310" y="168" width="14" height="16" rx="3"/><rect x="332" y="158" width="14" height="26" rx="3"/><rect x="354" y="148" width="14" height="36" rx="3"/><rect x="376" y="160" width="14" height="24" rx="3"/></g><rect x="398" y="142" width="14" height="42" rx="3" fill="#fc7705"/>
  <rect x="296" y="208" width="138" height="62" rx="10" fill="#123f73"/>
  <polyline points="310,254 332,240 354,246 378,226 420,232" fill="none" stroke="#5b8cc4" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="420" cy="232" r="5" fill="#fc7705"/>
  <rect x="126" y="284" width="308" height="46" rx="10" fill="#123f73"/>
  <circle cx="150" cy="307" r="11" fill="#fc7705"/><path d="m144.5 307 4 4 7-8" fill="none" stroke="#08305c" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="172" y="298" width="130" height="8" rx="4" fill="#c7d4e8" opacity=".85"/><rect x="172" y="313" width="88" height="7" rx="3.5" fill="#5b8cc4"/>
  <rect x="368" y="297" width="52" height="20" rx="10" fill="#5b8cc4" opacity=".6"/>
  <g transform="translate(280 232) rotate(-14)"><path d="M262 0A262 66 0 0 1 -262 0" fill="none" stroke="#fc7705" stroke-width="5" stroke-linecap="round"/></g>
</svg>`;
}

// ---------- reusable blocks ----------
const serviceCard = (s) => `<a class="card reveal" href="/services/${s.slug}">
  <div class="icon">${icon(s.icon)}</div>
  <h3>${esc(s.title)}</h3>
  <p>${esc(s.short)}</p>
  <ul class="ticks">${s.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
  <span class="more">Learn more ${icon('arrow')}</span>
</a>`;

const workCard = (p) => `<article class="work-card reveal">
  <img src="/assets/img/work/${esc(p.image)}" alt="${esc(p.alt)}" width="960" height="600" loading="lazy" decoding="async">
  <div class="work-body">
    <div class="work-meta"><span class="badge">${esc(p.category)}</span>${p.isDemo ? '<span class="badge demo">Demonstration project</span>' : ''}</div>
    <h3>${esc(p.title)}</h3>
    <p>${esc(p.description)}</p>
    <ul class="tags" aria-label="Technologies used">${p.tech.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
    ${has(p.liveUrl) ? `<a class="btn outline sm" href="${esc(p.liveUrl)}"${/^https?:/.test(p.liveUrl) ? ' target="_blank" rel="noopener"' : ''}>View live demo ${icon('arrow')}</a>` : ''}
  </div>
</article>`;

const specVal = (v) => (v == null || String(v).trim() === '' ? '<span class="tbc">Confirmed on enquiry</span>' : esc(v));
const planCards = () => `<div class="plans">${hosting.plans.map((p) => {
  const known = hosting.rows.filter((r) => p.specs[r.key] != null && String(p.specs[r.key]).trim() !== '');
  return `<div class="plan${p.recommended ? ' rec' : ''} reveal">
    ${p.recommended ? '<span class="tag">Recommended</span>' : ''}
    <h3>${esc(p.name)}</h3>
    <p class="aud">${esc(p.audience)}</p>
    <div class="price">${money(p.price)} <small>/ ${hosting.period}</small></div>
    ${known.length
      ? `<ul class="ticks note">${known.map((r) => `<li>${esc(r.label)}: ${esc(p.specs[r.key])}</li>`).join('')}</ul>`
      : '<p class="note">Storage, bandwidth, email, backup and renewal details for this plan are confirmed with you in writing before you sign up.</p>'}
    <a class="btn ${p.recommended ? '' : 'outline'} block" href="/contact?service=web-hosting&amp;plan=${p.id}">Enquire about ${esc(p.name)}</a>
  </div>`;
}).join('')}</div>`;

const faqList = (list) => `<div class="faq">${list.map((f) => `<details class="reveal"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}</div>`;
const faqLd = (list) => ({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: list.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) });

// ---------- HOME ----------
function home() {
  const why = [
    ['tool', 'Tailored development', 'Every project starts with your requirements, not a ready-made template. We build what fits your business.'],
    ['target', 'Practical business solutions', 'We recommend what will actually help your business, and leave out features you do not need.'],
    ['chat', 'Clear communication', 'Plain-language updates and one point of contact from the first discussion to launch.'],
    ['tag', 'Transparent pricing', 'You receive a written proposal with the scope and the price before any work begins.'],
    ['award', 'Quality-focused development', 'We test your website or application on different devices and browsers before it goes live.'],
    ['life', 'Ongoing support', 'Maintenance and technical support are available after launch, so you are not left on your own.']
  ];
  const steps = [
    ['Requirement Discussion', 'We listen to your goals, your users and your constraints, and ask the questions that shape the project.'],
    ['Planning and Proposal', 'You receive a written proposal with scope, timeline and price, so everyone agrees before work starts.'],
    ['Design and Development', 'We design and build in stages and share progress with you, so there are no surprises at the end.'],
    ['Testing and Launch', 'We test thoroughly, launch with you, and stay available for support afterwards.']
  ];
  const body = `
<section class="hero">
  <div class="wrap hero-grid">
    <div>
      <span class="eyebrow">Software Development &amp; IT Services</span>
      <h1>Build Your Business Online With Technology That Works.</h1>
      <p class="lead">Saturn Technologies delivers professional websites, custom web applications, e-commerce platforms and reliable IT solutions that help businesses grow.</p>
      <div class="actions">
        <a class="btn" href="/contact">Get a Free Consultation ${icon('arrow')}</a>
        <a class="btn on-dark" href="/our-work">Explore Our Work</a>
      </div>
      <ul class="value-props">
        <li>${icon('tool')} Custom-built solutions</li>
        <li>${icon('tag')} Transparent project pricing</li>
        <li>${icon('life')} Reliable technical support</li>
      </ul>
    </div>
    <div class="hero-visual">${heroVisual()}</div>
  </div>
</section>

<section class="section" id="services">
  <div class="wrap">
    ${sectionHead('Services', 'Everything you need to build and run your business online', 'Six services, delivered by one team from the first discussion to launch and beyond.')}
  <div class="grid g3">${services.map(serviceCard).join('')}</div>
  </div>
</section>

<section class="section alt" id="why-us">
  <div class="wrap">
    ${sectionHead('Why Saturn Technologies', 'A practical, transparent way of working', 'What you can expect when you work with us.')}
    <div class="grid g3">${why.map(([i, t, d]) => `<div class="card reveal"><div class="icon">${icon(i)}</div><h3>${t}</h3><p>${d}</p></div>`).join('')}</div>
  </div>
</section>

<section class="section dark" id="process">
  <div class="wrap">
    ${sectionHead('How We Work', 'Four steps from idea to launch', 'A clear process so you always know what happens next.')}
    <ol class="steps">${steps.map(([t, d]) => `<li class="reveal"><h3>${t}</h3><p>${d}</p></li>`).join('')}</ol>
  </div>
</section>

<section class="section" id="work">
  <div class="wrap">
    ${sectionHead('Our Work', 'Demonstration projects', 'Examples of what we can build. These are clearly labelled demonstration projects created by our team, not client projects.')}
    <div class="grid g3">${work.projects.slice(0, 3).map(workCard).join('')}</div>
    <p class="reveal"><a class="more" href="/our-work">See all projects ${icon('arrow')}</a></p>
  </div>
</section>

<section class="section alt" id="hosting">
  <div class="wrap">
    ${sectionHead('Hosting Plans', 'Website hosting, managed by the team that builds your site', 'Choose a plan, and we confirm the full specification with you before you sign up.')}
    ${planCards()}
    <p class="reveal"><a class="more" href="/hosting">Compare hosting plans ${icon('arrow')}</a></p>
  </div>
</section>

${cfg.training && cfg.training.enabled ? `<section class="section" id="training-teaser">
  <div class="wrap split">
    <div class="reveal">
      <span class="eyebrow">Training &amp; Internship</span>
      <h2>${esc(training.programmeName)}</h2>
      <p>${esc(training.summary)} Training is offered separately from our software development services.</p>
      <p><a class="more" href="/training">About the programme ${icon('arrow')}</a></p>
    </div>
    <div class="card reveal"><div class="icon">${icon('cap')}</div><h3>Learn by building</h3><p>Our training focuses on practical skills. We do not promise jobs or placements, and we explain exactly what the programme covers before you enrol.</p></div>
  </div>
</section>` : ''}

${testimonials.length ? `<section class="section alt" id="testimonials">
  <div class="wrap">
    ${sectionHead('Testimonials', 'What our customers say', '')}
    <div class="grid g3">${testimonials.map((t) => `<figure class="quote reveal"><blockquote>“${esc(t.quote)}”</blockquote><figcaption>${esc(t.name)}${has(t.role) ? `<span>${esc(t.role)}</span>` : ''}</figcaption></figure>`).join('')}</div>
  </div>
</section>` : ''}

<section class="section${testimonials.length ? '' : ' alt'}" id="faq">
  <div class="wrap">
    ${sectionHead('FAQ', 'Questions we are often asked', '', true)}
    ${faqList(faqs)}
  </div>
</section>

${ctaBand()}`;
  return layout({
    path: '/', fullTitle: true,
    title: 'Saturn Technologies | Software & Website Development Company',
    description: 'Saturn Technologies delivers professional websites, custom web applications, e-commerce platforms, hosting and IT services for growing businesses.',
    body, jsonld: [faqLd(faqs), { '@context': 'https://schema.org', '@type': 'WebSite', name: NAME, url: SITE + '/' }]
  });
}

// ---------- SERVICES ----------
function servicesIndex() {
  const body = `${pageHero({ crumbs: [['Home', '/'], ['Services']], title: 'Our Services', lead: 'Websites, custom web applications, e-commerce, hosting, design and IT support, all from one team.' })}
<section class="section"><div class="wrap">
  <h2 class="sr-only">Our services</h2>
  <div class="grid g3">${services.map(serviceCard).join('')}</div>
</div></section>
${ctaBand('Not sure which service you need?', 'Describe your business and what you want to achieve. We will suggest a sensible starting point.')}`;
  return layout({ path: '/services', title: 'IT Services Company for Growing Businesses', description: 'Explore Saturn Technologies services: website development, custom web applications, e-commerce, web hosting, UI/UX design and IT support.', body, crumbs: [['Home', '/'], ['Services', '/services']] });
}

function serviceDetail(s) {
  const others = services.filter((x) => x.slug !== s.slug).slice(0, 3);
  const body = `${pageHero({ crumbs: [['Home', '/'], ['Services', '/services'], [s.title]], title: s.title, lead: s.short })}
<section class="section"><div class="wrap split">
  <div class="prose">
    <h2>Overview</h2>
    <p>${esc(s.intro)}</p>
    <h2>What this includes</h2>
    <ul>${s.included.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
    <h2>Good for</h2>
    <ul>${s.goodFor.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
    <h2>How we work on it</h2>
    <p>We begin with a requirement discussion, then send a written proposal covering scope, timeline and price. Once you approve it we design, build, test and launch, and we remain available for support afterwards.</p>
    ${s.slug === 'web-hosting' ? '<p>You can see our hosting plans and prices on the <a href="/hosting">Hosting Plans</a> page.</p>' : ''}
  </div>
  <aside class="card" aria-label="Enquire about ${esc(s.title)}">
    <div class="icon">${icon(s.icon)}</div>
    <h3>Enquire about ${esc(s.title)}</h3>
    <p>Tell us what you need and we will get back to you with the next steps.</p>
    <ul class="ticks">${s.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
    <a class="btn block" href="/contact?service=${s.slug}">Send an enquiry ${icon('arrow')}</a>
  </aside>
</div></section>
<section class="section alt"><div class="wrap">
  ${sectionHead('More services', 'Related services', '')}
  <div class="grid g3">${others.map(serviceCard).join('')}</div>
</div></section>
${ctaBand()}`;
  return layout({
    path: `/services/${s.slug}`, title: s.metaTitle, description: s.metaDescription, body,
    crumbs: [['Home', '/'], ['Services', '/services'], [s.title, `/services/${s.slug}`]],
    jsonld: [{ '@context': 'https://schema.org', '@type': 'Service', name: s.title, description: s.metaDescription, provider: { '@type': 'Organization', name: NAME, url: SITE + '/' } }]
  });
}

// ---------- OUR WORK ----------
function ourWork() {
  const body = `${pageHero({ crumbs: [['Home', '/'], ['Our Work']], title: 'Our Work', lead: 'Examples of the websites and applications we can build.' })}
<section class="section"><div class="wrap">
  <div class="notice info"><strong>About these projects.</strong> The projects below are demonstration projects created by ${esc(SHORT)} to show our approach and abilities. They are not client projects, and they use sample data only. Genuine client work will be added here as it is completed, with the client's permission.</div>
  <h2 class="sr-only">Demonstration projects</h2>
  <div class="grid g3">${work.projects.map(workCard).join('')}</div>
</div></section>
${ctaBand('Have a project in mind?', 'Tell us what you want to build and we will discuss how we can help.')}`;
  return layout({ path: '/our-work', title: 'Our Work: Website & Web App Demonstrations', description: 'See demonstration projects from Saturn Technologies: a business website, an inventory dashboard and an online store, each clearly labelled as a demo.', body, crumbs: [['Home', '/'], ['Our Work', '/our-work']] });
}

// ---------- HOSTING ----------
function hostingPage() {
  const head = `<tr><th scope="col">Feature</th>${hosting.plans.map((p) => `<th scope="col">${esc(p.name)}</th>`).join('')}</tr>`;
  const priceRow = `<tr><th scope="row">Price</th>${hosting.plans.map((p) => `<td><strong>${money(p.price)}</strong> / ${hosting.period}</td>`).join('')}</tr>`;
  const rows = hosting.rows.map((r) => `<tr><th scope="row">${esc(r.label)}</th>${hosting.plans.map((p) => `<td>${specVal(p.specs[r.key])}</td>`).join('')}</tr>`).join('');
  const hostFaq = [faqs[3], faqs[4]];
  const body = `${pageHero({ crumbs: [['Home', '/'], ['Hosting Plans']], title: 'Website Hosting Plans', lead: 'Hosting, domain management and business email from the team that builds your website.' })}
<section class="section"><div class="wrap">
  <h2 class="sr-only">Hosting plans</h2>
  ${planCards()}
</div></section>
<section class="section alt"><div class="wrap">
  ${sectionHead('Compare plans', 'Plan comparison', 'Where a detail shows “Confirmed on enquiry”, we give you the exact specification in writing before you sign up.')}
  <div class="table-wrap reveal"><table class="compare"><caption class="sr-only">Comparison of hosting plans</caption><thead>${head}</thead><tbody>${priceRow}${rows}</tbody></table></div>
  <p class="fine">Plan prices are per ${hosting.period}. Applicable taxes are shown on your invoice. Renewal pricing and cancellation conditions are confirmed in writing before you sign up, and are also covered by our <a href="/terms">Terms and Conditions</a> and <a href="/refund-policy">Refund and Cancellation Policy</a>.</p>
</div></section>
<section class="section"><div class="wrap split">
  <div class="prose">
    <h2>More than hosting</h2>
    <p>We can also help you with the services around hosting:</p>
    <ul><li><strong>Domain management:</strong> registering, renewing and managing your domain name.</li><li><strong>Business email:</strong> email addresses on your own domain.</li><li><strong>Website migration:</strong> moving an existing website to our hosting.</li></ul>
    <p>See <a href="/services/web-hosting">Web Hosting Solutions</a> for details.</p>
  </div>
  <div>${faqList(hostFaq)}</div>
</div></section>
${ctaBand('Choose a plan or ask a question', 'Tell us about your website and we will recommend a suitable plan.', 'Enquire about hosting')}`;
  const ld = { '@context': 'https://schema.org', '@type': 'ItemList', name: 'Website hosting plans', itemListElement: hosting.plans.map((p, i) => ({ '@type': 'ListItem', position: i + 1, item: { '@type': 'Product', name: `${p.name} hosting plan`, description: p.audience, brand: { '@type': 'Brand', name: SHORT }, offers: { '@type': 'Offer', price: String(p.price), priceCurrency: 'INR', url: `${SITE}/hosting` } } })) };
  return layout({ path: '/hosting', title: 'Website Hosting Services & Plans', description: 'Website hosting plans from Saturn Technologies: Starter, Business and Managed Pro, with domain management, business email and migration help.', body, crumbs: [['Home', '/'], ['Hosting Plans', '/hosting']], jsonld: [ld, faqLd(hostFaq)] });
}

// ---------- ABOUT ----------
function about() {
  const details = [['Company name', NAME]];
  if (has(cfg.registration.cin)) details.push(['CIN', cfg.registration.cin]);
  if (has(cfg.registration.gstin)) details.push(['GSTIN', cfg.registration.gstin]);
  if (has(cfg.contact.address) && cfg.contact.addressVerified === true) details.push(['Registered office', cfg.contact.address]);
  const body = `${pageHero({ crumbs: [['Home', '/'], ['About Us']], title: 'About Saturn Technologies', lead: `${NAME} is a software and IT services company.` })}
<section class="section"><div class="wrap split">
  <div class="prose">
    <h2>Who we are</h2>
    <p>${esc(NAME)} builds websites, web applications and e-commerce platforms, and provides hosting and IT support, for businesses that want dependable technology without unnecessary complexity.</p>
    <p>We work with small and medium businesses, startups, entrepreneurs, local businesses, growing companies and organisations that need custom software.</p>
    <h2>What we do</h2>
    <ul>${services.map((s) => `<li><a href="/services/${s.slug}">${esc(s.title)}</a></li>`).join('')}</ul>
    <h2>How we approach our work</h2>
    <p>We start by understanding your business, and we recommend what will actually help. We put the scope and price in writing before work begins, we communicate in plain language, and we remain available for support after launch.</p>
  </div>
  <aside class="card" aria-label="Company details">
    <h3>Company details</h3>
    <div class="prose">${details.map(([k, v]) => `<h3>${esc(k)}</h3><p>${esc(v)}</p>`).join('')}</div>
    <a class="btn block" href="/contact">Contact us ${icon('arrow')}</a>
  </aside>
</div></section>
${ctaBand()}`;
  return layout({ path: '/about', title: 'About Us: Software and IT Services Company', description: 'About Saturn Technologies India Private Limited: a software development and IT services company building websites, web applications and e-commerce platforms.', body, crumbs: [['Home', '/'], ['About Us', '/about']] });
}

// ---------- TRAINING ----------
function trainingPage() {
  const facts = [['Duration', training.duration], ['Mode', training.mode], ['Fee', training.fee], ['Next batch', training.nextBatch]].filter(([, v]) => has(v));
  const body = `${pageHero({ crumbs: [['Home', '/'], ['Training & Internship']], title: 'Training & Internship', lead: 'Practical training in full stack development, offered separately from our software services.' })}
<section class="section"><div class="wrap">
  <div class="notice info">Training is an educational programme. It is separate from our software development services and is not priced or sold together with them.</div>
  <div class="split">
    <div class="prose">
      <h2>${esc(training.programmeName)}</h2>
      <p>${esc(training.summary)}</p>
      <h3>Topics covered (indicative)</h3>
      <ul>${training.topics.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
      <p>${esc(training.topicsNote)}</p>
      <h3>Who it is for</h3>
      <ul>${training.whoFor.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
      <h2>Training and internship are different</h2>
      <p><strong>Training</strong> is a course in which you learn skills. <strong>An internship</strong> is a separate engagement, if one is offered, with its own terms, and it is not automatically included with training. Completing training does not entitle you to an internship.</p>
      <h2>What we do not promise</h2>
      <p>We do not guarantee employment, placement, a particular salary or any job outcome. Your results depend on your own effort and on the job market.</p>
    </div>
    <aside class="card" aria-label="Programme details">
      <div class="icon">${icon('cap')}</div>
      <h3>${esc(training.programmeName)}</h3>
      ${facts.length ? `<ul class="ticks">${facts.map(([k, v]) => `<li>${esc(k)}: ${esc(v)}</li>`).join('')}</ul>` : '<p>Syllabus, duration, mode, fees and batch dates are shared when you enquire.</p>'}
      <a class="btn block" href="/training/register">Register for Training ${icon('arrow')}</a>
      <a class="btn outline block" href="/contact?service=training">Enquire about training ${icon('arrow')}</a>
    </aside>
  </div>
</div></section>`;
  return layout({ path: '/training', title: 'Java Full Stack Training & Internship', description: 'Java Full Stack training programme from Saturn Technologies: practical full stack skills, offered separately from software services. No placement guarantees.', body, crumbs: [['Home', '/'], ['Training & Internship', '/training']] });
}

// ---------- TRAINING REGISTER & LOGIN ----------
function trainingRegister() {
  const body = `${pageHero({
    crumbs: [['Home', '/'], ['Training & Internship', '/training'], ['Student Portal']],
    title: 'Student Registration & Login',
    lead: 'Access your student dashboard or create a new student account for the training programme.'
  })}
<section class="section">
  <div class="wrap auth-wrap">
    <div class="auth-card">
      <div class="auth-tabs" role="tablist" aria-label="Student account access">
        <button type="button" class="auth-tab active" id="tab-btn-signup" role="tab" aria-selected="true" aria-controls="panel-signup">Sign Up</button>
        <button type="button" class="auth-tab" id="tab-btn-login" role="tab" aria-selected="false" aria-controls="panel-login">Login</button>
      </div>

      <!-- Sign Up Form -->
      <div class="auth-panel" id="panel-signup" role="tabpanel" aria-labelledby="tab-btn-signup">
        <form class="form" id="student-signup-form" novalidate>
          <h2>Student Sign Up</h2>
          <p class="sub">Register with your college and academic details to enrol in the training programme.</p>

          <div class="field">
            <label for="reg-email">Email ID *</label>
            <input id="reg-email" name="email" type="email" autocomplete="email" required maxlength="160" placeholder="student@saturn.in">
          </div>

          <div class="row2">
            <div class="field">
              <label for="reg-phone">Contact Number *</label>
              <input id="reg-phone" name="contactNumber" type="tel" autocomplete="tel" required maxlength="15" inputmode="tel" placeholder="10-digit mobile number">
            </div>
            <div class="field">
              <label for="reg-college">College Name *</label>
              <input id="reg-college" name="collegeName" type="text" required maxlength="150" placeholder="Your College / University">
            </div>
          </div>

          <div class="row2">
            <div class="field">
              <label for="reg-year">Current Academic Year *</label>
              <select id="reg-year" name="academicYear" required>
                <option value="">Select Academic Year</option>
                <option value="1st Year">1st Year</option>
                <option value="2nd Year">2nd Year</option>
                <option value="3rd Year">3rd Year</option>
                <option value="4th Year / Final Year">4th Year / Final Year</option>
                <option value="Passed Out / Graduate">Passed Out / Graduate</option>
              </select>
            </div>
            <div class="field">
              <label for="reg-degree">Class / Degree *</label>
              <input id="reg-degree" name="degree" type="text" required maxlength="60" placeholder="e.g. B.Tech, M.Tech, BCA, MCA">
            </div>
          </div>

          <div class="row2">
            <div class="field">
              <label for="reg-password">New Password *</label>
              <input id="reg-password" name="password" type="password" autocomplete="new-password" required minlength="8" placeholder="At least 8 characters">
            </div>
            <div class="field">
              <label for="reg-confirm-password">Confirm Password *</label>
              <input id="reg-confirm-password" name="confirmPassword" type="password" autocomplete="new-password" required minlength="8" placeholder="Re-enter password">
            </div>
          </div>

          <button class="btn block" type="submit" id="reg-submit">Register Now ${icon('arrow')}</button>
          <div class="form-status" id="reg-status" role="status" aria-live="polite"></div>

          <p class="fine switch-prompt">
            Already registered? <button type="button" class="link-btn" id="link-to-login">Log in here</button>
          </p>
        </form>
      </div>

      <!-- Login Form -->
      <div class="auth-panel" id="panel-login" role="tabpanel" aria-labelledby="tab-btn-login" hidden>
        <form class="form" id="student-login-form" novalidate>
          <h2>Student Login</h2>
          <p class="sub">Enter your registered email address and password to sign in.</p>

          <div class="field">
            <label for="login-email">Registered Email Address *</label>
            <input id="login-email" name="email" type="email" autocomplete="email" required maxlength="160" placeholder="student@saturn.in">
          </div>

          <div class="field">
            <label for="login-password">Password *</label>
            <input id="login-password" name="password" type="password" autocomplete="current-password" required placeholder="Enter your password">
          </div>

          <button class="btn block" type="submit" id="login-submit">Log In ${icon('arrow')}</button>
          <div class="form-status" id="login-status" role="status" aria-live="polite"></div>

          <p class="fine switch-prompt">
            Need a student account? <button type="button" class="link-btn" id="link-to-signup">Sign up here</button>
          </p>
        </form>
      </div>

    </div>
  </div>
</section>`;

  return layout({
    path: '/training/register',
    title: 'Student Registration & Login',
    description: 'Register for the Saturn Technologies Java Full Stack training programme or log in to your student dashboard.',
    body,
    crumbs: [['Home', '/'], ['Training & Internship', '/training'], ['Student Registration & Login', '/training/register']],
    scripts: ['/assets/js/student.js']
  });
}

// ---------- TRAINING DASHBOARD ----------
function trainingDashboard() {
  const body = `${pageHero({
    crumbs: [['Home', '/'], ['Training & Internship', '/training'], ['Student Dashboard']],
    title: 'Student Dashboard',
    lead: 'Access your training programme details, referral code, and fee payments.'
  })}
<section class="section">
  <div class="wrap">
    <div class="dash-layout" id="dashboard-container">

      <!-- Left Sidebar (ONLY Referral Code and My Payments) -->
      <aside class="dash-sidebar" aria-label="Student menu">
        <div class="dash-profile">
          <span class="badge">Student</span>
          <div class="dash-profile-email" id="dash-email">Loading account...</div>
          <div class="dash-profile-meta" id="dash-meta"></div>
        </div>

        <nav class="dash-nav" aria-label="Dashboard navigation">
          <ul class="dash-nav-list">
            <li>
              <button type="button" class="dash-nav-item active" id="btn-tab-referral" data-view="referral" aria-current="page">
                ${icon('tag')} <span>Referral Code</span>
              </button>
            </li>
            <li>
              <button type="button" class="dash-nav-item" id="btn-tab-payments" data-view="payments">
                ${icon('award')} <span>My Payments</span>
              </button>
            </li>
            <li>
              <button type="button" class="dash-nav-item" id="btn-tab-materials" data-view="materials">
                ${icon('book')} <span>Materials</span>
              </button>
            </li>
          </ul>
        </nav>

        <div class="dash-sidebar-footer">
          <button type="button" class="btn outline sm block" id="btn-logout">
            Log Out ${icon('arrow')}
          </button>
        </div>
      </aside>

      <!-- Main Content Area -->
      <main class="dash-main" id="dash-content-area">

        <!-- Referral Code View -->
        <section class="dash-view" id="view-referral" aria-labelledby="heading-referral">
          <div class="dash-view-header">
            <h2 id="heading-referral">Referral Code &amp; Rewards</h2>
            <p class="sub">Share your referral code with peers. Earn ₹1,000 for every student who enrolls and completes payment.</p>
          </div>

          <!-- Referral Code Card -->
          <div class="card ref-code-card">
            <div class="ref-code-top">
              <span class="badge">Your Referral Code</span>
              <p class="ref-code-lead">Share this unique code or registration link with friends. When they register and complete their course payment, a ₹1,000 referral reward is added to your account.</p>
            </div>

            <div class="ref-code-display-row">
              <div class="ref-code-badge-wrap">
                <span class="ref-code-value" id="dash-ref-code">Loading…</span>
              </div>
              <div class="ref-code-actions">
                <button type="button" class="btn sm" id="btn-copy-ref" title="Copy referral code to clipboard">
                  ${icon('copy')} <span id="copy-btn-label">Copy Code</span>
                </button>
                <button type="button" class="btn sm outline" id="btn-share-ref" title="Share via device sharing">
                  ${icon('share')} <span>Share</span>
                </button>
                <a class="btn sm outline btn-wa-share" id="btn-wa-share" href="#" target="_blank" rel="noopener noreferrer" title="Share directly on WhatsApp">
                  ${icon('whatsapp')} <span>WhatsApp</span>
                </a>
              </div>
            </div>

            <div class="ref-notice" id="ref-notice-box">
              <small>Referral rewards are permanently recorded upon verified payment. Rewards are credited to your withdrawable balance after review.</small>
            </div>
          </div>

          <!-- Referral Summary Stats -->
          <div class="ref-stats-grid">
            <div class="card ref-stat-card">
              <div class="ref-stat-label">Total Successful Referrals</div>
              <div class="ref-stat-num" id="stat-total-referrals">0</div>
              <div class="ref-stat-sub">Enrolled &amp; paid peers</div>
            </div>
            <div class="card ref-stat-card">
              <div class="ref-stat-label">Total Referral Rewards</div>
              <div class="ref-stat-num" id="stat-total-rewards">₹0</div>
              <div class="ref-stat-sub">₹1,000 per referral</div>
            </div>
            <div class="card ref-stat-card ref-stat-highlight">
              <div class="ref-stat-label">Withdrawable Balance</div>
              <div class="ref-stat-num accent" id="stat-withdrawable-balance">₹0</div>
              <div class="ref-stat-sub">Credited balance only</div>
            </div>
          </div>

          <!-- Referral History Card -->
          <div class="card ref-history-card">
            <div class="ref-history-head">
              <h3>Referral History</h3>
              <p class="sub">Complete record of students who enrolled using your referral code.</p>
            </div>

            <div class="ref-table-wrap" id="ref-table-wrap" hidden>
              <table class="ref-table" id="ref-history-table">
                <thead>
                  <tr>
                    <th scope="col">Referred Student</th>
                    <th scope="col">Referral Date</th>
                    <th scope="col">Reward Amount</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody id="ref-history-tbody">
                  <!-- Dynamically populated from backend -->
                </tbody>
              </table>
            </div>

            <div class="ref-empty-state" id="ref-empty-state">
              <div class="icon">${icon('users')}</div>
              <h4>No referrals yet</h4>
              <p>You haven't referred any students yet. Share your referral code above to start earning ₹1,000 per course enrollment.</p>
            </div>
          </div>
        </section>

        <!-- My Payments View -->
        <section class="dash-view" id="view-payments" aria-labelledby="heading-payments" hidden>
          <div class="dash-view-header">
            <h2 id="heading-payments">My Payments</h2>
            <p class="sub">Your course registration payments, transaction receipts, and payment status.</p>
          </div>
          <div id="payments-history-area">
            <div class="card dash-card" id="payments-placeholder-card">
              <div class="icon">${icon('award')}</div>
              <h3>Payment Records</h3>
              <p>Your payment details and fee records will be displayed here once your course payment is processed.</p>
              <div class="dash-card-footer">
                <a class="btn sm" href="/training/course-registration">Go to Course Registration ${icon('arrow')}</a>
              </div>
            </div>
          </div>
        </section>

        <!-- Materials View (Feature 3: Online PDF Materials) -->
        <section class="dash-view" id="view-materials" aria-labelledby="heading-materials" hidden>
          <div class="dash-view-header">
            <h2 id="heading-materials">Materials</h2>
            <p class="sub">Official learning resources, curriculum guides, and module lecture notes for your enrolled course.</p>
          </div>

          <!-- Protected Online Reading Notice -->
          <div class="materials-notice-card card">
            <div class="materials-notice-icon">${icon('award')}</div>
            <div class="materials-notice-content">
              <h4>Protected Course Documents</h4>
              <p>These study materials are strictly authorized for online viewing by enrolled students of the Java Full Stack Training Programme. Downloading and printing are disabled to preserve curriculum integrity.</p>
            </div>
            <div class="materials-notice-badge">
              <span class="badge ok">Online Access Active</span>
            </div>
          </div>

          <!-- Materials Catalog Grid -->
          <div class="materials-grid" id="materials-grid">
            <div class="card dash-card materials-loading" id="materials-loading-card">
              <div class="icon">${icon('book')}</div>
              <h3>Loading Course Materials…</h3>
              <p>Retrieving verified curriculum documents for your enrolled training programme.</p>
            </div>
          </div>

          <!-- Empty state fallback -->
          <div class="card dash-card" id="materials-empty-card" hidden>
            <div class="icon">${icon('book')}</div>
            <h3>No Materials Available</h3>
            <p>Course materials are currently being prepared for your cohort and will be accessible shortly.</p>
          </div>
        </section>

      </main>

    </div>
  </div>

  <!-- Official Printable Payment Receipt Modal -->
  <div id="receipt-modal-backdrop" class="receipt-modal-backdrop no-print" hidden>
    <div class="receipt-modal-card">
      <div class="receipt-modal-head no-print">
        <div class="receipt-modal-title">
          <h3>Official Payment Receipt</h3>
          <span class="badge ok">Verified Payment</span>
        </div>
        <div class="receipt-modal-actions">
          <button type="button" class="btn sm" id="modal-btn-print">
            ${icon('monitor')} Print Receipt
          </button>
          <button type="button" class="btn sm outline" id="modal-btn-download">
            ${icon('arrow')} Download PDF
          </button>
          <button type="button" class="btn-receipt-close" id="modal-btn-close" aria-label="Close receipt modal">
            ${icon('close')}
          </button>
        </div>
      </div>

      <!-- Printable Document -->
      <div class="printable-receipt" id="printable-receipt">
        <div class="receipt-top-bar">
          <div class="receipt-company-brand">
            <span class="mark" aria-hidden="true"><i class="ring"></i><i class="sym"></i></span>
            <div class="receipt-company-titles">
              <span class="receipt-brand-name">SATURN TECHNOLOGIES</span>
              <span class="receipt-brand-legal">Saturn Technologies India Private Limited</span>
              <small class="receipt-brand-contact">support@saturn.in • www.saturn.in</small>
            </div>
          </div>
          <div class="receipt-meta-box">
            <span class="receipt-doc-tag">TAX INVOICE / RECEIPT</span>
            <p><strong>Receipt No:</strong> <span id="r-number">SATURN-REC-2026-0001</span></p>
            <p><strong>Date &amp; Time:</strong> <span id="r-date">03 Nov 2026, 11:28 PM</span></p>
            <p><strong>Payment Status:</strong> <span class="badge ok" id="r-status-badge">SUCCESSFUL</span></p>
          </div>
        </div>

        <div class="receipt-divider"></div>

        <div class="receipt-info-grid">
          <div class="receipt-info-col">
            <small class="receipt-sublabel">BILLED TO (STUDENT)</small>
            <h4 id="r-student-email">student@saturn.in</h4>
            <p id="r-student-meta">B.Tech Computer Science • Saturn Institute of Technology</p>
            <p id="r-student-phone">Contact: +91 9876543210</p>
          </div>
          <div class="receipt-info-col">
            <small class="receipt-sublabel">TRANSACTION DETAILS</small>
            <p><strong>Transaction ID:</strong> <span id="r-payment-id">cf_pay_12345</span></p>
            <p><strong>Order ID:</strong> <span id="r-order-id">order_12345</span></p>
            <p><strong>Payment Mode:</strong> <span id="r-method">UPI</span></p>
            <p><strong>Gateway:</strong> Cashfree Payments (Verified)</p>
          </div>
        </div>

        <table class="receipt-table">
          <thead>
            <tr>
              <th scope="col" style="width:48%">Course Description</th>
              <th scope="col" style="width:20%">Academic Batch</th>
              <th scope="col" style="width:16%">Course Fee</th>
              <th scope="col" style="width:16%;text-align:right">Amount (INR)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <strong id="r-course-name">Java Full Stack Training Programme</strong>
                <small class="receipt-course-desc">Industry-oriented programme covering Core Java, REST APIs, Frontend, Database, and Live Project Development.</small>
              </td>
              <td>2026 Batch</td>
              <td>₹5,000.00</td>
              <td style="text-align:right">₹4,237.29</td>
            </tr>
            <tr class="receipt-tax-row">
              <td colspan="3" style="text-align:right">CGST (9%):</td>
              <td style="text-align:right">₹381.35</td>
            </tr>
            <tr class="receipt-tax-row">
              <td colspan="3" style="text-align:right">SGST (9%):</td>
              <td style="text-align:right">₹381.36</td>
            </tr>
            <tr class="receipt-total-row">
              <td colspan="3" style="text-align:right"><strong>Total Amount Paid:</strong></td>
              <td style="text-align:right"><strong class="receipt-total-val">₹5,000.00</strong></td>
            </tr>
          </tbody>
        </table>

        <div class="receipt-bottom-grid">
          <div class="receipt-notes-col">
            <p><strong>Payment Confirmation:</strong> This document confirms official receipt of payment for the course enrolment. This is a computer-generated tax invoice verified through our payment gateway. No physical signature is required.</p>
            <p class="receipt-footer-links">support@saturn.in • www.saturn.in • CIN: U72900AP2026PTC000000</p>
          </div>
          <div class="receipt-seal-col">
            <div class="receipt-seal-stamp">
              <span class="seal-line-1">VERIFIED &amp; PAID</span>
              <span class="seal-line-2">SATURN TECHNOLOGIES</span>
              <small class="seal-line-3">OFFICIAL RECEIPT</small>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Embedded Online PDF Reader Modal (Feature 3: Online-only, No download, No print) -->
  <div id="pdf-viewer-modal" class="pdf-viewer-overlay no-print" hidden role="dialog" aria-modal="true" aria-labelledby="pdf-doc-title">
    <div class="pdf-viewer-container">
      
      <!-- Top Viewer Toolbar (Navigation and Zoom ONLY, Zero download or print controls) -->
      <header class="pdf-viewer-toolbar no-print">
        <div class="pdf-toolbar-left">
          <button type="button" class="btn sm outline btn-pdf-back" id="pdf-btn-back" title="Back to Materials">
            ${icon('arrow')} Back to Materials
          </button>
          <div class="pdf-doc-meta">
            <h3 id="pdf-doc-title" class="pdf-doc-title">Course Document</h3>
            <span class="badge" id="pdf-doc-category">Curriculum</span>
          </div>
        </div>

        <!-- Center: Page Navigation -->
        <div class="pdf-toolbar-center" aria-label="Page navigation">
          <button type="button" class="btn-pdf-nav" id="pdf-btn-prev" aria-label="Previous page" title="Previous page (Left arrow)">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"></polyline></svg>
          </button>
          <div class="pdf-page-indicator" aria-live="polite">
            Page <span id="pdf-page-num" class="pdf-page-num">1</span> of <span id="pdf-page-count" class="pdf-page-count">1</span>
          </div>
          <button type="button" class="btn-pdf-nav" id="pdf-btn-next" aria-label="Next page" title="Next page (Right arrow)">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </button>
        </div>

        <!-- Right: Zoom Controls & Close -->
        <div class="pdf-toolbar-right" aria-label="Zoom controls">
          <button type="button" class="btn-pdf-nav" id="pdf-btn-zoom-out" aria-label="Zoom out" title="Zoom out (-)">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </button>
          <span class="pdf-zoom-level" id="pdf-zoom-level" title="Current zoom">100%</span>
          <button type="button" class="btn-pdf-nav" id="pdf-btn-zoom-in" aria-label="Zoom in" title="Zoom in (+)">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </button>
          <button type="button" class="btn sm outline btn-pdf-fit" id="pdf-btn-zoom-fit" title="Fit to width">
            Fit Width
          </button>
          <button type="button" class="btn-receipt-close" id="pdf-btn-close" aria-label="Close document viewer">
            ${icon('close')}
          </button>
        </div>
      </header>

      <!-- PDF Canvas Viewport Area -->
      <div class="pdf-viewport" id="pdf-viewport" tabindex="0">
        <!-- Loading State -->
        <div class="pdf-loading-state" id="pdf-loading">
          <div class="pdf-spinner" aria-hidden="true"></div>
          <p>Loading document securely…</p>
        </div>

        <!-- Error State -->
        <div class="pdf-error-state" id="pdf-error" hidden>
          <p id="pdf-error-msg">Unable to load document.</p>
          <button type="button" class="btn sm" id="pdf-btn-retry">Retry</button>
        </div>

        <!-- Canvas Container -->
        <div class="pdf-canvas-wrapper" id="pdf-canvas-wrapper">
          <canvas id="pdf-canvas" role="img" aria-label="PDF Document Page Canvas"></canvas>
          <div class="pdf-watermark-overlay" id="pdf-watermark-overlay" aria-hidden="true">
            <span>Saturn Technologies • Online Reading Copy • Authorized Student Access</span>
          </div>
        </div>
      </div>

      <!-- Bottom Security Statusbar -->
      <footer class="pdf-statusbar no-print">
        <span class="pdf-security-tag">Protected Course Material • Online Viewing Only • Downloads &amp; Printing are disabled</span>
        <span class="pdf-nav-hint">Use arrow keys or scroll to read</span>
      </footer>

    </div>
  </div>
</section>`;

  return layout({
    path: '/training/dashboard',
    title: 'Student Dashboard',
    description: 'Manage your training programme details, referral code, and fee payments from your personal dashboard.',
    body,
    crumbs: [['Home', '/'], ['Training & Internship', '/training'], ['Student Dashboard', '/training/dashboard']],
    scripts: ['/assets/vendor/pdfjs/pdf.min.js', '/assets/js/student.js']
  });
}

// ---------- COURSE REGISTRATION & PAYMENT ----------
function courseRegistrationPage() {
  const body = `${pageHero({
    crumbs: [['Home', '/'], ['Training & Internship', '/training'], ['Course Registration']],
    title: 'Course Registration',
    lead: 'Enrol in the Java Full Stack Training Programme and complete your course registration.'
  })}
<section class="section">
  <div class="wrap course-reg-wrap">
    
    <!-- Single Centered Course Card -->
    <div class="card course-reg-card" id="course-reg-card">
      <div class="course-card-header">
        <span class="badge">Comprehensive Programme</span>
        <h2>Java Full Stack Training Programme</h2>
        <p class="course-summary">A structured, practical programme covering Core Java, SQL &amp; Databases, Spring REST APIs, Front-End fundamentals, Git version control, and real-world project development.</p>
      </div>

      <div class="course-highlights">
        <ul class="ticks">
          <li>Full Stack curriculum with backend Java and modern frontend</li>
          <li>Hands-on coding exercises, database integration &amp; projects</li>
          <li>Dedicated student access to Referral Portal and Materials</li>
          <li>Direct mentorship and practical skill-building sessions</li>
        </ul>
      </div>

      <div class="course-fee-box">
        <div class="fee-meta">One-time Course Fee</div>
        <div class="fee-amount">₹5,000 <small>INR</small></div>
        <p class="fee-note">Inclusive of complete course curriculum and access to training portal.</p>
      </div>

      <!-- Referral Code Input (Optional) -->
      <div class="field referral-field">
        <label for="course-ref-code">Referral Code <span class="opt">(Optional)</span></label>
        <div class="referral-input-row">
          <input id="course-ref-code" name="referralCode" type="text" placeholder="e.g. SATURN-XXXX-XXXX" maxlength="40" autocomplete="off">
          <button type="button" class="btn outline sm" id="btn-validate-ref">Apply Code</button>
        </div>
        <p class="ref-feedback" id="ref-feedback" role="status" aria-live="polite"></p>
      </div>

      <!-- Payment / Registration Action -->
      <div class="course-action-box">
        <button class="btn block" type="button" id="btn-course-register">
          Register for Course • ₹5,000 ${icon('arrow')}
        </button>
        <div class="form-status" id="course-pay-status" role="status" aria-live="polite"></div>
        <p class="fine fee-security-note">
          Secure online payment processed by Cashfree Payment Gateway (INR).
        </p>
      </div>

    </div>

  </div>
</section>`;

  return layout({
    path: '/training/course-registration',
    title: 'Course Registration',
    description: 'Complete your registration and payment for the Saturn Technologies Java Full Stack Training Programme.',
    body,
    crumbs: [['Home', '/'], ['Training & Internship', '/training'], ['Course Registration', '/training/course-registration']],
    scripts: ['https://sdk.cashfree.com/js/v3/cashfree.js', '/assets/js/student.js']
  });
}

// ---------- CONTACT ----------
const { SERVICE_OPTIONS, BUDGETS } = require('./options');
function contact() {
  const ci = contactItems();
  const wa = waLink();
  const body = `${pageHero({ crumbs: [['Home', '/'], ['Contact Us']], title: 'Contact Us', lead: 'Tell us about your project and we will get back to you.' })}
<section class="section"><div class="wrap contact-grid">
  <div>
    <h2>Let's talk about your project</h2>
    <p class="fine">Use the enquiry form and we will respond to you using the email address or phone number you provide.</p>
    ${ci.length ? ci.map((i) => `<div class="ci"><div class="icon">${icon(i.icon)}</div><div><small>${i.label}</small>${i.html}</div></div>`).join('') : ''}
    ${wa ? `<p><a class="btn outline" href="${esc(wa)}" target="_blank" rel="noopener">${icon('chat')} Enquire on WhatsApp</a></p>` : ''}
  </div>
  <form class="form" id="enquiry-form" action="/api/contact" method="post" novalidate>
    <h2>Send an enquiry</h2>
    <p class="sub">Fields marked * are required.</p>
    <div class="row2">
      <div class="field"><label for="f-name">Full name *</label><input id="f-name" name="name" type="text" autocomplete="name" required maxlength="100"></div>
      <div class="field"><label for="f-company">Company name <span class="opt">(optional)</span></label><input id="f-company" name="company" type="text" autocomplete="organization" maxlength="120"></div>
    </div>
    <div class="row2">
      <div class="field"><label for="f-email">Email *</label><input id="f-email" name="email" type="email" autocomplete="email" required maxlength="160"></div>
      <div class="field"><label for="f-phone">Phone number *</label><input id="f-phone" name="phone" type="tel" autocomplete="tel" required maxlength="20" inputmode="tel"></div>
    </div>
    <div class="row2">
      <div class="field"><label for="f-service">Service required *</label><select id="f-service" name="service" required><option value="">Select a service</option>${SERVICE_OPTIONS.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select></div>
      <div class="field"><label for="f-budget">Estimated budget <span class="opt">(optional)</span></label><select id="f-budget" name="budget"><option value="">Prefer not to say</option>${BUDGETS.map((b) => `<option>${esc(b)}</option>`).join('')}</select></div>
    </div>
    <div class="field"><label for="f-message">Project description *</label><textarea id="f-message" name="message" required minlength="20" maxlength="3000" placeholder="What would you like to build or fix? Who is it for?"></textarea></div>
    <div class="hp" aria-hidden="true"><label for="f-website">Leave this field empty</label><input id="f-website" name="website" type="text" tabindex="-1" autocomplete="off"></div>
    <input type="hidden" name="t" id="f-t" value="">
    <button class="btn block" type="submit" id="f-submit">Send enquiry ${icon('arrow')}</button>
    <div class="form-status" id="form-status" role="status" aria-live="polite"></div>
    <p class="fine">By sending this form you agree that we may use your details to respond to your enquiry. See our <a href="/privacy">Privacy Policy</a>.</p>
  </form>
</div></section>`;
  return layout({ path: '/contact', title: 'Contact Us: Get a Free Consultation', description: 'Contact Saturn Technologies for a free consultation about your website, web application, e-commerce store, hosting or IT support needs.', body, crumbs: [['Home', '/'], ['Contact Us', '/contact']] });
}

function notFound() {
  const body = `${pageHero({ crumbs: [['Home', '/'], ['Page not found']], title: 'Page not found', lead: 'The page you are looking for does not exist or has moved.' })}
<section class="section"><div class="wrap"><div class="actions"><a class="btn" href="/">Go to the homepage</a><a class="btn outline" href="/contact">Contact us</a></div></div></section>`;
  return layout({ path: '/404', title: 'Page not found', description: 'This page could not be found.', body, noindex: true });
}

// ---------- ADMIN PORTAL ----------
function adminRedirect() {
  return `<!doctype html>
<html lang="en-IN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Admin Portal | Saturn Technologies</title>
<meta name="robots" content="noindex, nofollow">
<script>
(function() {
  try {
    var t = localStorage.getItem('saturn_admin_token');
    if (t) {
      window.location.replace('/admin/dashboard');
    } else {
      window.location.replace('/admin/login');
    }
  } catch(e) {
    window.location.replace('/admin/login');
  }
})();
</script>
</head>
<body style="font-family:system-ui,-apple-system,sans-serif;background:#061f3d;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
  <p>Connecting to Admin Portal…</p>
</body>
</html>`;
}

function adminLogin() {
  const body = `
<section class="section admin-login-section">
  <div class="wrap" style="max-width: 460px; margin: 3rem auto 5rem;">
    <div class="card admin-login-card">
      <div class="admin-login-head" style="text-align: center; margin-bottom: 2rem;">
        <span class="badge" style="margin-bottom: 0.75rem;">Saturn Technologies</span>
        <h1 style="font-size: 1.75rem; margin: 0 0 0.5rem;">Admin Portal</h1>
        <p class="fine" style="margin: 0; color: var(--muted, #64748b);">Authorized personnel only. All access is logged.</p>
      </div>

      <form id="admin-login-form" class="form admin-form" novalidate>
        <div class="field">
          <label for="admin-email">Admin Email *</label>
          <input id="admin-email" name="email" type="email" placeholder="admin@saturn.in" required autocomplete="username" autofocus>
        </div>

        <div class="field">
          <label for="admin-password">Password *</label>
          <input id="admin-password" name="password" type="password" placeholder="••••••••••••" required autocomplete="current-password">
        </div>

        <button class="btn block" type="submit" id="admin-login-submit" style="margin-top: 1.25rem;">
          Sign In to Admin Portal ${icon('arrow')}
        </button>

        <div class="form-status" id="admin-login-status" role="status" aria-live="polite" style="margin-top: 1rem;"></div>
      </form>

      <div class="admin-security-note" style="margin-top: 1.75rem; padding-top: 1rem; border-top: 1px solid var(--border, #e2e8f0); text-align: center; font-size: 0.8rem; color: #64748b;">
        <span class="icon" style="display:inline-block; vertical-align:middle; margin-right:4px;">${icon('award')}</span>
        Single Master Administrator Access
      </div>
    </div>
  </div>
</section>`;

  return layout({
    path: '/admin/login',
    title: 'Admin Portal Login',
    description: 'Secure administrator access portal for Saturn Technologies.',
    body,
    noindex: true,
    crumbs: [['Home', '/'], ['Admin Portal', '/admin/login']],
    scripts: ['/assets/js/admin.js']
  });
}

function adminDashboard() {
  const body = `
<div class="admin-dashboard-wrapper">
  <div class="wrap admin-layout">
    
    <!-- Admin Sidebar Navigation -->
    <aside class="admin-sidebar" aria-label="Admin Navigation">
      <div class="admin-sidebar-header">
        <div class="admin-badge-row">
          <span class="badge">Master Admin</span>
        </div>
        <div class="admin-user-info">
          <strong id="admin-sidebar-email">admin@saturn.in</strong>
          <small class="admin-role-title">Saturn Technologies</small>
        </div>
      </div>

      <nav class="admin-nav" aria-label="Admin Sections">
        <ul>
          <li>
            <button type="button" class="admin-nav-item active" id="nav-admin-dashboard" data-view="dashboard">
              <span class="icon">${icon('monitor')}</span>
              <span>Dashboard</span>
            </button>
          </li>
          <li>
            <button type="button" class="admin-nav-item" id="nav-admin-students" data-view="students">
              <span class="icon">${icon('users')}</span>
              <span>Students</span>
            </button>
          </li>
          <li>
            <button type="button" class="admin-nav-item" id="nav-admin-payments" data-view="payments">
              <span class="icon">${icon('tag')}</span>
              <span>Payments</span>
            </button>
          </li>
          <li>
            <button type="button" class="admin-nav-item" id="nav-admin-referrals" data-view="referrals">
              <span class="icon">${icon('chat')}</span>
              <span>Referral Management</span>
            </button>
          </li>
          <li>
            <button type="button" class="admin-nav-item" id="nav-admin-materials" data-view="materials">
              <span class="icon">${icon('book')}</span>
              <span>Materials</span>
            </button>
          </li>
          <li>
            <button type="button" class="admin-nav-item" id="nav-admin-settings" data-view="settings">
              <span class="icon">${icon('tool')}</span>
              <span>Settings</span>
            </button>
          </li>
          <li class="admin-nav-logout-item">
            <button type="button" class="admin-nav-item btn-admin-logout" id="btn-admin-logout">
              <span class="icon">${icon('close')}</span>
              <span>Logout</span>
            </button>
          </li>
        </ul>
      </nav>
    </aside>

    <!-- Admin Main Content Area -->
    <main class="admin-main" id="admin-main-panel">
      
      <!-- Top Bar / Breadcrumb / Actions -->
      <div class="admin-topbar">
        <div class="admin-topbar-title">
          <h1 id="admin-view-title">Dashboard Overview</h1>
          <p id="admin-view-sub" class="fine">Real-time operations, revenue metrics, and system analytics.</p>
        </div>
        <div class="admin-topbar-actions">
          <button type="button" class="btn sm outline" id="btn-admin-refresh">
            Refresh Data
          </button>
        </div>
      </div>

      <!-- VIEW 1: DASHBOARD OVERVIEW -->
      <section class="admin-view-panel active" id="view-admin-dashboard" aria-labelledby="admin-view-title">
        
        <!-- Summary Stat Cards Grid (8 Cards) -->
        <div class="admin-stats-grid">
          <div class="card stat-card">
            <div class="stat-header">
              <span class="stat-label">Registered Students</span>
              <span class="icon">${icon('users')}</span>
            </div>
            <div class="stat-value" id="stat-total-students">0</div>
            <div class="stat-meta">Total student signups</div>
          </div>

          <div class="card stat-card stat-card-ok">
            <div class="stat-header">
              <span class="stat-label">Paid Students</span>
              <span class="badge ok">Enrolled</span>
            </div>
            <div class="stat-value" id="stat-paid-students">0</div>
            <div class="stat-meta">Verified course payments</div>
          </div>

          <div class="card stat-card">
            <div class="stat-header">
              <span class="stat-label">Pending Payments</span>
              <span class="badge warn">Pending</span>
            </div>
            <div class="stat-value" id="stat-pending-payments">0</div>
            <div class="stat-meta">Awaiting gateway capture</div>
          </div>

          <div class="card stat-card">
            <div class="stat-header">
              <span class="stat-label">Failed Payments</span>
              <span class="badge danger">Failed</span>
            </div>
            <div class="stat-value" id="stat-failed-payments">0</div>
            <div class="stat-meta">Unsuccessful attempts</div>
          </div>

          <div class="card stat-card stat-card-primary">
            <div class="stat-header">
              <span class="stat-label">Verified Course Revenue</span>
              <span class="icon">${icon('award')}</span>
            </div>
            <div class="stat-value" id="stat-verified-revenue">₹0</div>
            <div class="stat-meta">₹5,000 / successful student</div>
          </div>

          <div class="card stat-card">
            <div class="stat-header">
              <span class="stat-label">Successful Referrals</span>
              <span class="icon">${icon('share')}</span>
            </div>
            <div class="stat-value" id="stat-total-referrals">0</div>
            <div class="stat-meta">Paid referred students</div>
          </div>

          <div class="card stat-card">
            <div class="stat-header">
              <span class="stat-label">Rewards Awaiting Credit</span>
              <span class="badge warn">Uncredited</span>
            </div>
            <div class="stat-value" id="stat-uncredited-rewards">0</div>
            <div class="stat-meta">₹1,000 pending admin credit</div>
          </div>

          <div class="card stat-card stat-card-ok">
            <div class="stat-header">
              <span class="stat-label">Rewards Credited</span>
              <span class="badge ok">Credited</span>
            </div>
            <div class="stat-value" id="stat-credited-rewards">0</div>
            <div class="stat-meta">Withdrawable rewards approved</div>
          </div>
        </div>

        <!-- Quick Navigation Bar -->
        <div class="admin-quick-links card" style="margin-top: 1.5rem; padding: 1rem 1.25rem;">
          <strong style="margin-right: 1rem;">Quick Shortcuts:</strong>
          <button type="button" class="btn sm outline" data-goto="students">Manage Students</button>
          <button type="button" class="btn sm outline" data-goto="payments">View Payments</button>
          <button type="button" class="btn sm outline" data-goto="referrals">Process Rewards</button>
          <button type="button" class="btn sm outline" data-goto="materials">Course Materials</button>
        </div>

        <!-- Recent Tables Section -->
        <div class="admin-recent-grid" style="margin-top: 2rem;">
          
          <!-- Recent Students -->
          <div class="card admin-table-card">
            <div class="admin-card-head">
              <h3>Recent Student Registrations</h3>
              <button type="button" class="btn sm outline" data-goto="students">View All</button>
            </div>
            <div class="table-responsive">
              <table class="admin-table" id="table-recent-students">
                <thead>
                  <tr>
                    <th>Student Name</th>
                    <th>Email</th>
                    <th>College</th>
                    <th>Registered</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td colspan="5" class="table-loading">Loading student records…</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Recent Transactions -->
          <div class="card admin-table-card" style="margin-top: 1.5rem;">
            <div class="admin-card-head">
              <h3>Recent Payment Transactions</h3>
              <button type="button" class="btn sm outline" data-goto="payments">View All</button>
            </div>
            <div class="table-responsive">
              <table class="admin-table" id="table-recent-payments">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Amount</th>
                    <th>Transaction ID</th>
                    <th>Date &amp; Time</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td colspan="5" class="table-loading">Loading recent transactions…</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Recent Referrals -->
          <div class="card admin-table-card" style="margin-top: 1.5rem;">
            <div class="admin-card-head">
              <h3>Recent Referral Activity</h3>
              <button type="button" class="btn sm outline" data-goto="referrals">View All</button>
            </div>
            <div class="table-responsive">
              <table class="admin-table" id="table-recent-referrals">
                <thead>
                  <tr>
                    <th>Referrer</th>
                    <th>Referred Student</th>
                    <th>Reward</th>
                    <th>Reward Status</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td colspan="5" class="table-loading">Loading recent referrals…</td></tr>
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </section>

      <!-- VIEW 2: STUDENTS -->
      <section class="admin-view-panel" id="view-admin-students" hidden>
        <div class="admin-toolbar card">
          <div class="admin-search-box">
            <input type="search" id="students-search" placeholder="Search by name, email, phone, or college…" autocomplete="off">
          </div>
          <div class="admin-filter-group">
            <span class="filter-label">Status:</span>
            <button type="button" class="filter-chip active" data-filter="students" data-value="ALL">All</button>
            <button type="button" class="filter-chip" data-filter="students" data-value="PAID">Paid</button>
            <button type="button" class="filter-chip" data-filter="students" data-value="UNPAID">Unpaid</button>
            <button type="button" class="filter-chip" data-filter="students" data-value="ACTIVE">Active</button>
            <button type="button" class="filter-chip" data-filter="students" data-value="INACTIVE">Deactivated</button>
          </div>
        </div>

        <div class="card admin-table-card" style="margin-top: 1rem;">
          <div class="admin-card-head">
            <h3>Registered Students Directory (<span id="students-count-badge">0</span>)</h3>
          </div>
          <div class="table-responsive">
            <table class="admin-table" id="table-admin-students">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Contact</th>
                  <th>College &amp; Degree</th>
                  <th>Registered</th>
                  <th>Payment</th>
                  <th>Account</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody id="tbody-admin-students">
                <tr><td colspan="7" class="table-loading">Loading students…</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- VIEW 3: PAYMENTS -->
      <section class="admin-view-panel" id="view-admin-payments" hidden>
        <div class="admin-toolbar card">
          <div class="admin-search-box">
            <input type="search" id="payments-search" placeholder="Search by student, email, order, or transaction ID…" autocomplete="off">
          </div>
          <div class="admin-filter-group">
            <span class="filter-label">Payment Status:</span>
            <button type="button" class="filter-chip active" data-filter="payments" data-value="ALL">All</button>
            <button type="button" class="filter-chip" data-filter="payments" data-value="SUCCESSFUL">Successful</button>
            <button type="button" class="filter-chip" data-filter="payments" data-value="PENDING">Pending</button>
            <button type="button" class="filter-chip" data-filter="payments" data-value="FAILED">Failed</button>
          </div>
        </div>

        <div class="card admin-table-card" style="margin-top: 1rem;">
          <div class="admin-card-head">
            <h3>Payment Transactions (<span id="payments-count-badge">0</span>)</h3>
            <div class="admin-card-head-meta">
              <strong>Verified Revenue: </strong><span id="payments-verified-sum">₹0</span>
            </div>
          </div>
          <div class="table-responsive">
            <table class="admin-table" id="table-admin-payments">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Course</th>
                  <th>Fee Paid</th>
                  <th>Transaction ID</th>
                  <th>Payment Date</th>
                  <th>Method</th>
                  <th>Status</th>
                  <th>Receipt</th>
                </tr>
              </thead>
              <tbody id="tbody-admin-payments">
                <tr><td colspan="8" class="table-loading">Loading payments…</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- VIEW 4: REFERRAL MANAGEMENT -->
      <section class="admin-view-panel" id="view-admin-referrals" hidden>
        <div class="admin-toolbar card">
          <div class="admin-search-box">
            <input type="search" id="referrals-search" placeholder="Search by referrer, referral code, or referred student…" autocomplete="off">
          </div>
          <div class="admin-filter-group">
            <span class="filter-label">Reward Status:</span>
            <button type="button" class="filter-chip active" data-filter="referrals" data-value="ALL">All</button>
            <button type="button" class="filter-chip" data-filter="referrals" data-value="MONEY UNCREDITED">Uncredited</button>
            <button type="button" class="filter-chip" data-filter="referrals" data-value="REFERRAL CLAIM IN PROCESS">In Process</button>
            <button type="button" class="filter-chip" data-filter="referrals" data-value="REFERRAL SUCCESSFULLY CREDITED">Credited</button>
          </div>
        </div>

        <div class="card admin-table-card" style="margin-top: 1rem;">
          <div class="admin-card-head">
            <h3>Referral Attribution &amp; Rewards (<span id="referrals-count-badge">0</span>)</h3>
            <div class="admin-card-head-meta">
              <span>Standard Reward: <strong>₹1,000 / paid referral</strong></span>
            </div>
          </div>
          <div class="table-responsive">
            <table class="admin-table" id="table-admin-referrals">
              <thead>
                <tr>
                  <th>Referrer</th>
                  <th>Referral Code</th>
                  <th>Referred Student</th>
                  <th>Referred Payment</th>
                  <th>Reward</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody id="tbody-admin-referrals">
                <tr><td colspan="7" class="table-loading">Loading referral records…</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- VIEW 5: MATERIALS -->
      <section class="admin-view-panel" id="view-admin-materials" hidden>
        <div class="admin-toolbar card" style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h3 style="margin:0 0 0.25rem;">Course Study Materials (PDF)</h3>
            <p class="fine" style="margin:0;">Protected documents displayed online to enrolled paid students.</p>
          </div>
          <button type="button" class="btn sm" id="btn-open-upload-material">
            ${icon('book')} Upload New PDF
          </button>
        </div>

        <div class="card admin-table-card" style="margin-top: 1rem;">
          <div class="admin-card-head">
            <h3>Uploaded Course Materials (<span id="materials-count-badge">0</span>)</h3>
          </div>
          <div class="table-responsive">
            <table class="admin-table" id="table-admin-materials">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Document Title</th>
                  <th>Category</th>
                  <th>File Size</th>
                  <th>Uploaded Date</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody id="tbody-admin-materials">
                <tr><td colspan="7" class="table-loading">Loading course materials…</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- VIEW 6: SETTINGS & AUDIT -->
      <section class="admin-view-panel" id="view-admin-settings" hidden>
        
        <!-- Admin Profile & Password Row -->
        <div class="admin-settings-grid">
          
          <!-- Master Admin Details Card -->
          <div class="card">
            <div class="admin-card-head">
              <h3>Master Administrator Profile</h3>
              <span class="badge ok">Protected</span>
            </div>
            <div class="admin-profile-details" style="margin-top: 1rem;">
              <p><strong>Account Role:</strong> Single Master Administrator</p>
              <p><strong>Admin Email:</strong> <span id="admin-settings-email">admin@saturn.in</span></p>
              <p><strong>Security Policy:</strong> Multi-admin creation is disabled. Single master account access enforced.</p>
              <p><strong>Session Expiry:</strong> 24 Hours with HTTP-only secure cookie</p>
              <p><strong>Last Logged In:</strong> <span id="admin-settings-last-login">—</span></p>
            </div>
          </div>

          <!-- Change Password Card -->
          <div class="card">
            <div class="admin-card-head">
              <h3>Change Admin Password</h3>
            </div>
            <form id="admin-change-password-form" class="form" style="margin-top: 1rem;" novalidate>
              <div class="field">
                <label for="admin-current-pass">Current Password *</label>
                <input id="admin-current-pass" name="currentPassword" type="password" required autocomplete="current-password">
              </div>

              <div class="field">
                <label for="admin-new-pass">New Password * (Min 8 characters)</label>
                <input id="admin-new-pass" name="newPassword" type="password" required minlength="8" autocomplete="new-password">
              </div>

              <div class="field">
                <label for="admin-confirm-pass">Confirm New Password *</label>
                <input id="admin-confirm-pass" name="confirmPassword" type="password" required minlength="8" autocomplete="new-password">
              </div>

              <button type="submit" class="btn sm" id="btn-submit-change-pass" style="margin-top: 0.5rem;">
                Update Admin Password ${icon('arrow')}
              </button>

              <div class="form-status" id="admin-password-status" role="status" aria-live="polite" style="margin-top: 0.75rem;"></div>
            </form>
          </div>

        </div>

        <!-- Audit Trail Card -->
        <div class="card admin-table-card" style="margin-top: 1.5rem;">
          <div class="admin-card-head">
            <h3>Admin Security Audit Trail</h3>
            <span class="fine">Permanent audit record of all administrative operations</span>
          </div>
          <div class="table-responsive">
            <table class="admin-table" id="table-admin-audit-logs">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Action</th>
                  <th>Target / Resource</th>
                  <th>IP Address</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody id="tbody-admin-audit-logs">
                <tr><td colspan="5" class="table-loading">Loading audit records…</td></tr>
              </tbody>
            </table>
          </div>
        </div>

      </section>

    </main>

  </div>
</div>

<!-- MODAL 1: STUDENT PROFILE & DETAIL DRAWER -->
<div id="modal-student-detail" class="receipt-modal-backdrop no-print" hidden role="dialog" aria-modal="true" aria-labelledby="modal-student-name">
  <div class="receipt-modal-card" style="max-width: 760px;">
    <div class="receipt-modal-head no-print">
      <div class="receipt-modal-title">
        <h3 id="modal-student-name">Student Profile</h3>
        <span class="badge" id="modal-student-paid-badge">Unpaid</span>
      </div>
      <button type="button" class="btn-receipt-close" id="modal-student-close" aria-label="Close modal">
        ${icon('close')}
      </button>
    </div>
    <div class="student-detail-body" style="padding: 1.5rem; max-height: 75vh; overflow-y: auto;">
      <div id="modal-student-content">Loading student profile…</div>
    </div>
  </div>
</div>

<!-- MODAL 2: UPDATE REFERRAL REWARD STATUS -->
<div id="modal-update-reward" class="receipt-modal-backdrop no-print" hidden role="dialog" aria-modal="true" aria-labelledby="modal-reward-title">
  <div class="receipt-modal-card" style="max-width: 540px;">
    <div class="receipt-modal-head no-print">
      <div class="receipt-modal-title">
        <h3 id="modal-reward-title">Manage Referral Reward</h3>
      </div>
      <button type="button" class="btn-receipt-close" id="modal-reward-close" aria-label="Close modal">
        ${icon('close')}
      </button>
    </div>
    <form id="form-update-reward" style="padding: 1.5rem;">
      <input type="hidden" id="reward-field-referral-id">
      <div class="field">
        <label>Referrer:</label>
        <div id="reward-field-referrer" style="font-weight:600; color:var(--navy-900);">—</div>
      </div>
      <div class="field">
        <label>Referred Student:</label>
        <div id="reward-field-referred" style="color:var(--text);">—</div>
      </div>
      <div class="field">
        <label>Reward Amount:</label>
        <div style="font-weight:700; color:var(--ok, #16a34a); font-size:1.1rem;">₹1,000 INR</div>
      </div>
      <div class="field">
        <label for="reward-field-status">Reward Progression Status *</label>
        <select id="reward-field-status" required>
          <option value="MONEY UNCREDITED">MONEY UNCREDITED</option>
          <option value="REFERRAL CLAIM IN PROCESS">REFERRAL CLAIM IN PROCESS</option>
          <option value="REFERRAL SUCCESSFULLY CREDITED">REFERRAL SUCCESSFULLY CREDITED</option>
        </select>
        <small class="fine" id="reward-status-hint" style="display:block; margin-top:0.35rem; color:#64748b;">
          Selecting "REFERRAL SUCCESSFULLY CREDITED" will immediately credit ₹1,000 to the referrer's withdrawable balance.
        </small>
      </div>
      <div class="field">
        <label for="reward-field-notes">Admin Notes (Optional)</label>
        <textarea id="reward-field-notes" rows="2" placeholder="e.g. Verified payment and approved reward credit"></textarea>
      </div>
      <div class="actions" style="margin-top:1.5rem; display:flex; justify-content:flex-end; gap:0.5rem;">
        <button type="button" class="btn sm outline" id="modal-reward-cancel">Cancel</button>
        <button type="submit" class="btn sm" id="modal-reward-submit">Save Status</button>
      </div>
      <div class="form-status" id="reward-update-status" role="status" aria-live="polite" style="margin-top: 0.75rem;"></div>
    </form>
  </div>
</div>

<!-- MODAL 3: UPLOAD MATERIAL -->
<div id="modal-upload-material" class="receipt-modal-backdrop no-print" hidden role="dialog" aria-modal="true" aria-labelledby="modal-upload-title">
  <div class="receipt-modal-card" style="max-width: 580px;">
    <div class="receipt-modal-head no-print">
      <div class="receipt-modal-title">
        <h3 id="modal-upload-title">Upload Course Material PDF</h3>
      </div>
      <button type="button" class="btn-receipt-close" id="modal-upload-close" aria-label="Close modal">
        ${icon('close')}
      </button>
    </div>
    <form id="form-upload-material" style="padding: 1.5rem;">
      <div class="field">
        <label for="upload-mat-title">Document Title *</label>
        <input type="text" id="upload-mat-title" required placeholder="e.g. Core Java Programming Guide" maxlength="120">
      </div>
      <div class="field">
        <label for="upload-mat-category">Category *</label>
        <input type="text" id="upload-mat-category" required placeholder="e.g. Core Java / Spring Boot / Frontend" maxlength="60">
      </div>
      <div class="field">
        <label for="upload-mat-desc">Description (Optional)</label>
        <textarea id="upload-mat-desc" rows="2" placeholder="Brief outline of document contents…" maxlength="300"></textarea>
      </div>
      <div class="field">
        <label for="upload-mat-file">Select PDF File * (Max 15MB)</label>
        <input type="file" id="upload-mat-file" accept="application/pdf,.pdf" required>
        <small class="fine" style="display:block; margin-top:0.25rem; color:#64748b;">File must be a genuine PDF (%PDF- header verified by server).</small>
      </div>
      <div class="actions" style="margin-top:1.5rem; display:flex; justify-content:flex-end; gap:0.5rem;">
        <button type="button" class="btn sm outline" id="modal-upload-cancel">Cancel</button>
        <button type="submit" class="btn sm" id="modal-upload-submit">Upload Document</button>
      </div>
      <div class="form-status" id="upload-mat-status" role="status" aria-live="polite" style="margin-top: 0.75rem;"></div>
    </form>
  </div>
</div>

<!-- MODAL 4: EDIT MATERIAL DETAILS -->
<div id="modal-edit-material" class="receipt-modal-backdrop no-print" hidden role="dialog" aria-modal="true" aria-labelledby="modal-edit-title">
  <div class="receipt-modal-card" style="max-width: 540px;">
    <div class="receipt-modal-head no-print">
      <div class="receipt-modal-title">
        <h3 id="modal-edit-title">Edit Material Details</h3>
      </div>
      <button type="button" class="btn-receipt-close" id="modal-edit-close" aria-label="Close modal">
        ${icon('close')}
      </button>
    </div>
    <form id="form-edit-material" style="padding: 1.5rem;">
      <input type="hidden" id="edit-mat-id">
      <div class="field">
        <label for="edit-mat-title">Document Title *</label>
        <input type="text" id="edit-mat-title" required maxlength="120">
      </div>
      <div class="field">
        <label for="edit-mat-category">Category *</label>
        <input type="text" id="edit-mat-category" required maxlength="60">
      </div>
      <div class="field">
        <label for="edit-mat-desc">Description</label>
        <textarea id="edit-mat-desc" rows="2" maxlength="300"></textarea>
      </div>
      <div class="field">
        <label for="edit-mat-order">Display Order</label>
        <input type="number" id="edit-mat-order" min="1" max="100">
      </div>
      <div class="actions" style="margin-top:1.5rem; display:flex; justify-content:flex-end; gap:0.5rem;">
        <button type="button" class="btn sm outline" id="modal-edit-cancel">Cancel</button>
        <button type="submit" class="btn sm" id="modal-edit-submit">Save Changes</button>
      </div>
      <div class="form-status" id="edit-mat-status" role="status" aria-live="polite" style="margin-top: 0.75rem;"></div>
    </form>
  </div>
</div>

<!-- MODAL 5: REPLACE MATERIAL PDF -->
<div id="modal-replace-material" class="receipt-modal-backdrop no-print" hidden role="dialog" aria-modal="true" aria-labelledby="modal-replace-title">
  <div class="receipt-modal-card" style="max-width: 540px;">
    <div class="receipt-modal-head no-print">
      <div class="receipt-modal-title">
        <h3 id="modal-replace-title">Replace PDF File</h3>
      </div>
      <button type="button" class="btn-receipt-close" id="modal-replace-close" aria-label="Close modal">
        ${icon('close')}
      </button>
    </div>
    <form id="form-replace-material" style="padding: 1.5rem;">
      <input type="hidden" id="replace-mat-id">
      <p id="replace-mat-doc-name" style="font-weight:600; margin-bottom:1rem;"></p>
      <div class="field">
        <label for="replace-mat-file">Select Replacement PDF File * (Max 15MB)</label>
        <input type="file" id="replace-mat-file" accept="application/pdf,.pdf" required>
        <small class="fine" style="display:block; margin-top:0.25rem; color:#64748b;">The existing file will be backed up and replaced with the new PDF.</small>
      </div>
      <div class="actions" style="margin-top:1.5rem; display:flex; justify-content:flex-end; gap:0.5rem;">
        <button type="button" class="btn sm outline" id="modal-replace-cancel">Cancel</button>
        <button type="submit" class="btn sm" id="modal-replace-submit">Replace File</button>
      </div>
      <div class="form-status" id="replace-mat-status" role="status" aria-live="polite" style="margin-top: 0.75rem;"></div>
    </form>
  </div>
</div>

<!-- MODAL 6: OFFICIAL PAYMENT RECEIPT MODAL (REUSED) -->
<div id="receipt-modal-backdrop" class="receipt-modal-backdrop no-print" hidden role="dialog" aria-modal="true" aria-labelledby="modal-receipt-heading">
  <div class="receipt-modal-card">
    <div class="receipt-modal-head no-print">
      <div class="receipt-modal-title">
        <h3 id="modal-receipt-heading">Official Payment Receipt</h3>
        <span class="badge ok" id="admin-receipt-status-badge">Verified Payment</span>
      </div>
      <div class="receipt-modal-actions">
        <button type="button" class="btn sm" id="modal-btn-print">
          ${icon('monitor')} Print Receipt
        </button>
        <button type="button" class="btn sm outline" id="modal-btn-download">
          ${icon('arrow')} Download PDF
        </button>
        <button type="button" class="btn-receipt-close" id="modal-btn-close" aria-label="Close receipt modal">
          ${icon('close')}
        </button>
      </div>
    </div>

    <!-- Printable Document -->
    <div class="printable-receipt" id="printable-receipt">
      <div class="receipt-top-bar">
        <div class="receipt-company-brand">
          <span class="mark" aria-hidden="true"><i class="ring"></i><i class="sym"></i></span>
          <div class="receipt-company-titles">
            <span class="receipt-brand-name">SATURN TECHNOLOGIES</span>
            <span class="receipt-brand-legal">Saturn Technologies India Private Limited</span>
            <small class="receipt-brand-contact">support@saturn.in • www.saturn.in</small>
          </div>
        </div>
        <div class="receipt-meta-box">
          <span class="receipt-doc-tag">TAX INVOICE / RECEIPT</span>
          <p><strong>Receipt No:</strong> <span id="r-number">—</span></p>
          <p><strong>Date &amp; Time:</strong> <span id="r-date">—</span></p>
          <p><strong>Payment Status:</strong> <span class="badge ok" id="r-status-badge">SUCCESSFUL</span></p>
        </div>
      </div>

      <div class="receipt-divider"></div>

      <div class="receipt-info-grid">
        <div class="receipt-info-col">
          <small class="receipt-sublabel">BILLED TO (STUDENT)</small>
          <h4 id="r-student-email">—</h4>
          <p id="r-student-meta">—</p>
          <p id="r-student-phone">—</p>
        </div>
        <div class="receipt-info-col">
          <small class="receipt-sublabel">TRANSACTION DETAILS</small>
          <p><strong>Transaction ID:</strong> <span id="r-payment-id">—</span></p>
          <p><strong>Order ID:</strong> <span id="r-order-id">—</span></p>
          <p><strong>Payment Mode:</strong> <span id="r-method">UPI</span></p>
          <p><strong>Gateway:</strong> Cashfree Payments (Verified)</p>
        </div>
      </div>

      <table class="receipt-table">
        <thead>
          <tr>
            <th scope="col" style="width:48%">Course Description</th>
            <th scope="col" style="width:20%">Academic Batch</th>
            <th scope="col" style="width:16%">Course Fee</th>
            <th scope="col" style="width:16%;text-align:right">Amount (INR)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <strong id="r-course-name">Java Full Stack Training Programme</strong>
              <small class="receipt-course-desc">Industry-oriented programme covering Core Java, REST APIs, Frontend, Database, and Live Project Development.</small>
            </td>
            <td>2026 Batch</td>
            <td>₹5,000.00</td>
            <td style="text-align:right">₹4,237.29</td>
          </tr>
          <tr class="receipt-tax-row">
            <td colspan="3" style="text-align:right">CGST (9%):</td>
            <td style="text-align:right">₹381.35</td>
          </tr>
          <tr class="receipt-tax-row">
            <td colspan="3" style="text-align:right">SGST (9%):</td>
            <td style="text-align:right">₹381.36</td>
          </tr>
          <tr class="receipt-total-row">
            <td colspan="3" style="text-align:right"><strong>Total Amount Paid:</strong></td>
            <td style="text-align:right"><strong class="receipt-total-val">₹5,000.00</strong></td>
          </tr>
        </tbody>
      </table>

      <div class="receipt-bottom-grid">
        <div class="receipt-notes-col">
          <p><strong>Payment Confirmation:</strong> This document confirms official receipt of payment for the course enrolment. This is a computer-generated tax invoice verified through our payment gateway. No physical signature is required.</p>
          <p class="receipt-footer-links">support@saturn.in • www.saturn.in • CIN: U72900AP2026PTC000000</p>
        </div>
        <div class="receipt-seal-col">
          <div class="receipt-seal-stamp">
            <span class="seal-line-1">VERIFIED &amp; PAID</span>
            <span class="seal-line-2">SATURN TECHNOLOGIES</span>
            <small class="seal-line-3">OFFICIAL RECEIPT</small>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- MODAL 7: ONLINE PDF VIEWER (ADMIN PREVIEW) -->
<div id="pdf-viewer-modal" class="pdf-viewer-overlay no-print" hidden role="dialog" aria-modal="true" aria-labelledby="pdf-doc-title">
  <div class="pdf-viewer-container">
    <header class="pdf-viewer-toolbar no-print">
      <div class="pdf-toolbar-left">
        <button type="button" class="btn sm outline btn-pdf-back" id="pdf-btn-back" title="Close Viewer">
          ${icon('arrow')} Back
        </button>
        <div class="pdf-doc-meta">
          <h3 id="pdf-doc-title" class="pdf-doc-title">Course Document</h3>
          <span class="badge" id="pdf-doc-category">Curriculum</span>
        </div>
      </div>
      <div class="pdf-toolbar-center">
        <button type="button" class="btn-pdf-nav" id="pdf-btn-prev" aria-label="Previous Page" title="Previous Page">${icon('arrow')}</button>
        <span class="pdf-page-display">Page <span id="pdf-page-num">1</span> of <span id="pdf-page-count">1</span></span>
        <button type="button" class="btn-pdf-nav" id="pdf-btn-next" aria-label="Next Page" title="Next Page">${icon('arrow')}</button>
      </div>
      <div class="pdf-toolbar-right">
        <button type="button" class="btn-pdf-tool" id="pdf-btn-zoom-out" aria-label="Zoom Out" title="Zoom Out">−</button>
        <span class="pdf-zoom-level" id="pdf-zoom-val">100%</span>
        <button type="button" class="btn-pdf-tool" id="pdf-btn-zoom-in" aria-label="Zoom In" title="Zoom In">+</button>
      </div>
    </header>

    <div class="pdf-canvas-area" id="pdf-canvas-area" tabindex="0">
      <div class="pdf-loading-state" id="pdf-loading">
        <div class="pdf-spinner" aria-hidden="true"></div>
        <p>Loading document preview…</p>
      </div>
      <div class="pdf-error-state" id="pdf-error" hidden>
        <p id="pdf-error-msg">Unable to load document.</p>
        <button type="button" class="btn sm" id="pdf-btn-retry">Retry</button>
      </div>
      <div class="pdf-canvas-wrapper" id="pdf-canvas-wrapper">
        <canvas id="pdf-canvas" role="img" aria-label="PDF Document Page Canvas"></canvas>
      </div>
    </div>

    <footer class="pdf-statusbar no-print">
      <span class="pdf-security-tag">Admin Preview Mode • Protected Document</span>
    </footer>
  </div>
</div>`;

  return layout({
    path: '/admin/dashboard',
    title: 'Admin Dashboard',
    description: 'Master administration dashboard for Saturn Technologies.',
    body,
    noindex: true,
    crumbs: [['Home', '/'], ['Admin Portal', '/admin/dashboard']],
    scripts: ['/assets/vendor/pdfjs/pdf.min.js', '/assets/js/admin.js']
  });
}

module.exports = { home, servicesIndex, serviceDetail, ourWork, hostingPage, about, trainingPage, trainingRegister, trainingDashboard, courseRegistrationPage, contact, notFound, adminRedirect, adminLogin, adminDashboard, SERVICE_OPTIONS, BUDGETS };
