'use strict';
// Legal pages. These are DRAFTS written to match what this website actually does. They are not legal advice.
// Every item marked LAWYER-REVIEW below should be checked by an Indian lawyer before the notice is switched off
// (site.config.json -> legal.showDraftNotice).
const L = require('./lib');
const { cfg, NAME, SHORT, esc, has, layout, pageHero } = L;

const HOST = (cfg.legal && cfg.legal.hostingProvider) || 'Vercel';
const MAILER = (cfg.legal && cfg.legal.emailProvider) || 'Resend';
const CITY = has(cfg.legal && cfg.legal.governingLawCity) ? cfg.legal.governingLawCity : '';

const contactLine = () => (has(cfg.contact.email)
  ? `by email at <a href="mailto:${esc(cfg.contact.email)}">${esc(cfg.contact.email)}</a> or through the form on our <a href="/contact">Contact page</a>`
  : 'through the form on our <a href="/contact">Contact page</a>');

function legalPage({ path: p, title, description, lead, sections }) {
  const toc = sections.map(([h], i) => `<a href="#s${i + 1}">${i + 1}. ${esc(h)}</a>`).join('');
  const bodyHtml = sections.map(([h, b], i) => `<h2 id="s${i + 1}">${i + 1}. ${esc(h)}</h2>\n${b}`).join('\n');
  const draft = cfg.legal && cfg.legal.showDraftNotice
    ? `<div class="notice"><strong>Draft notice.</strong> This document has been prepared for ${esc(NAME)} and is awaiting review by a legal professional. It describes how this website and our services currently work, and it may be updated after that review.</div>` : '';
  const body = `${pageHero({ crumbs: [['Home', '/'], [title]], title, lead })}
<section class="section"><div class="wrap legal-layout">
  <nav class="toc" aria-label="On this page"><b>On this page</b>${toc}</nav>
  <article class="prose">
    ${draft}
    <p><em>Last updated: ${esc((cfg.legal && cfg.legal.lastUpdated) || '')}</em></p>
    ${bodyHtml}
  </article>
</div></section>`;
  return layout({ path: p, title, description, body, crumbs: [['Home', '/'], [title, p]] });
}

// ------------------------------------------------------------------ PRIVACY
function privacy() {
  return legalPage({
    path: '/privacy', title: 'Privacy Policy',
    description: `How ${NAME} collects, uses and protects personal information submitted through this website.`,
    lead: 'What information we collect through this website, why we collect it, and the choices you have.',
    sections: [
      ['Who we are', `<p>This website is operated by ${esc(NAME)} ("${esc(SHORT)}", "we", "us"). This policy explains how we handle personal information that you give us through this website. You can contact us ${contactLine()}.</p>`],
      ['Information we collect', `<h3>Information you give us</h3>
<p>When you send an enquiry through our contact form we collect the details you enter: your name, email address, phone number, the service you are interested in, your project description, and, if you choose to provide them, your company name and estimated budget.</p>
<h3>Technical information</h3>
<p>Our website is delivered through ${esc(HOST)}. Like most web hosting services, ${esc(HOST)} may process technical information such as IP address, browser type, device type, pages requested and the time of the request, in order to deliver the website, keep it secure and prevent abuse. We use your IP address in a limited way to protect our contact form from spam, by counting how many submissions arrive in a short period.</p>`],
      ['Why we use your information', `<ul><li>To respond to your enquiry and discuss your requirements.</li><li>To prepare proposals and, where you become a customer, to provide our services.</li><li>To keep this website and our contact form secure and to prevent spam and abuse.</li><li>To meet legal, tax and accounting obligations.</li></ul><p>We do not sell your personal information.</p>`],
      ['Cookies and analytics', `<p>This website does not set advertising cookies and does not currently use analytics or tracking tools. If we add analytics or any non-essential cookies in future, we will update this policy and, where required, ask for your consent first.</p>`],
      ['How your information is stored and who receives it', `<p>When you submit the contact form, the details are sent by email to our business mailbox. This website does not keep a database of enquiries. Your enquiry is therefore held in our email system and in any records we keep to manage your enquiry or project.</p>
<p>To run the website and deliver your enquiry we use the following third-party services, which may process information on our behalf:</p>
<table><tr><th>Service</th><th>Purpose</th></tr><tr><td>${esc(HOST)}</td><td>Hosting this website and running the contact form</td></tr><tr><td>${esc(MAILER)}</td><td>Delivering contact form submissions to us by email</td></tr></table>
<p>We may also share information with professional advisers, such as accountants and lawyers, and with authorities where the law requires it. Some of these providers may process information on servers outside India. <!-- LAWYER-REVIEW: cross-border transfer wording under the DPDP Act --></p>`],
      ['How long we keep information', `<p>We keep enquiry details only for as long as we need them to respond to you and to manage any resulting relationship, and for as long as the law requires us to keep business and tax records. When information is no longer needed we delete it or anonymise it. <!-- LAWYER-REVIEW: confirm retention periods once the business has settled its record-keeping policy --></p>`],
      ['Security', `<p>The website is served over an encrypted connection (HTTPS). The contact form is validated on our server, protected against automated submissions and limited in how often it can be used. No method of transmission or storage is completely secure, so we cannot guarantee absolute security.</p>`],
      ['Your privacy requests', `<p>Subject to applicable law, you may ask us to tell you what personal information we hold about you, to correct it, or to delete it, and you may withdraw any consent you have given. To make a request, contact us ${contactLine()}. We may need to confirm your identity before acting on a request, and we may keep information that we are legally required to keep. <!-- LAWYER-REVIEW: rights and grievance process under the Digital Personal Data Protection Act, 2023 --></p>`],
      ['Children', `<p>Our website and services are intended for businesses and adults. We do not knowingly collect personal information from children.</p>`],
      ['Links to other websites', `<p>This website may link to other websites, including social media pages and demonstration projects. We are not responsible for the privacy practices of other websites.</p>`],
      ['Changes to this policy', `<p>We may update this policy from time to time. The latest version will always be on this page with its "last updated" date.</p>`],
      ['Contact', `<p>${esc(NAME)}<br>Contact us ${contactLine()}.</p>`]
    ]
  });
}

// ------------------------------------------------------------------ TERMS
function terms() {
  const law = CITY
    ? `The courts at ${esc(CITY)}, India, will have jurisdiction.`
    : 'The courts of competent jurisdiction in India will have jurisdiction.';
  return legalPage({
    path: '/terms', title: 'Terms and Conditions',
    description: `Terms and conditions for the services provided by ${NAME}, including software development, hosting and support.`,
    lead: 'The terms that apply when you use this website or buy our services.',
    sections: [
      ['About these terms', `<p>These terms apply to your use of this website and to the services provided by ${esc(NAME)} ("${esc(SHORT)}", "we", "us"), including website and software development, e-commerce development, hosting, UI/UX design and IT support. When we agree a project or plan with you in writing (for example in a proposal, quotation or order), that document applies together with these terms. If they conflict, the signed or accepted proposal prevails for that project.</p>`],
      ['Service scope', `<p>The scope of each project, including what we will deliver, the timeline and the price, is set out in a written proposal that you approve before work starts. Work outside the agreed scope is a change request, which we will quote for before doing it. Training programmes are separate from our software services and are covered in section 12.</p>`],
      ['Payment terms', `<p>The price and the payment schedule for each project are stated in your proposal. Unless the proposal says otherwise, invoices are payable by the due date shown on the invoice. Applicable taxes, including GST where it applies, are shown on the invoice. We may pause work or suspend services while an undue amount remains unpaid. <!-- LAWYER-REVIEW: late-payment and interest wording --></p>`],
      ['Refunds and cancellation', `<p>Refunds and cancellations are governed by our <a href="/refund-policy">Refund and Cancellation Policy</a>, which forms part of these terms.</p>`],
      ['What we need from you', `<p>To deliver on time we need content, images, access details and feedback from you promptly. You confirm that you have the right to use everything you give us, that it does not infringe anyone else's rights or break the law, and that the information you give us is accurate. Timelines move if the things we need are delayed.</p>`],
      ['Website ownership and intellectual property', `<p>Once you have paid for a project in full, you own the final custom design and custom code we created specifically for you, unless the proposal says otherwise. Until payment in full, we keep ownership of the work and you receive only a limited right to review it.</p>
<p>Third-party materials, such as open-source software, themes, plugins, fonts and stock images, remain under their own licences, and those licences continue to apply. We keep ownership of our general know-how, tools and reusable code that is not specific to your business. Unless you ask us not to in writing, we may describe the project in our portfolio. <!-- LAWYER-REVIEW: IP assignment and portfolio-use wording --></p>`],
      ['Hosting and renewals', `<p>Hosting plans are provided for the period and price stated when you sign up. The technical specification of each plan, the renewal price and the cancellation conditions are confirmed to you in writing before you sign up. Hosting must be used lawfully and fairly: you must not use it for unlawful content, malware, phishing, spam or anything that puts our systems or other customers at risk. We may suspend a hosting service where we reasonably believe these terms have been breached or the service is being misused. Please keep your own copies of important data. <!-- LAWYER-REVIEW: renewal and auto-renewal wording once the commercial policy is settled --></p>`],
      ['Domain names', `<p>Domain names are registered through third-party registrars and are subject to their rules and fees. We recommend that your domain is registered in your own name, and unless we agree otherwise in writing, it will be. You are responsible for renewing your domain on time. We are not responsible for a domain that lapses because a renewal was not paid or authorised.</p>`],
      ['Maintenance and support', `<p>Support covers fixing faults in work we have delivered and helping you with technical questions about it. The period and scope of support for your project or plan are stated in your proposal or plan. New features, content changes and problems caused by changes made by you or by others are outside basic support and may be quoted separately.</p>`],
      ['Third-party services', `<p>Our work may rely on third-party services such as payment gateways, email providers, hosting providers and domain registrars. These are provided under their own terms and may require their own fees and approval processes. We are not responsible for outages, changes or decisions made by third-party providers.</p>`],
      ['Confidentiality', `<p>Each of us will keep the other's non-public business information confidential and use it only for the purposes of the services, except where disclosure is required by law or to our professional advisers who are bound to keep it confidential.</p>`],
      ['Training programmes', `<p>Training and internship programmes are educational and are separate from our software development services. Fees, schedules and conditions for training are confirmed at enrolment. We do not guarantee employment, placement or any job outcome. An internship, if offered, is a separate engagement with its own terms.</p>`],
      ['Warranties and liability', `<p>We will carry out our services with reasonable skill and care. We do not promise uninterrupted or error-free operation, particular search engine rankings, traffic or sales. To the extent the law allows, we are not liable for indirect or consequential loss, or for loss of profit, revenue, business or data, and our total liability for any claim relating to a service is limited to the fees you paid us for that service. Nothing in these terms limits liability that cannot be limited by law. <!-- LAWYER-REVIEW: limitation of liability and warranty disclaimers --></p>`],
      ['Suspension and termination', `<p>You may end a project or plan by giving us written notice, subject to the Refund and Cancellation Policy. Either of us may end the agreement if the other commits a serious breach and does not fix it within a reasonable period after written notice. We may suspend or end a service immediately where needed to protect our systems, to comply with the law or to stop misuse. Terms that by their nature should continue after the agreement ends, including payment, ownership, confidentiality, liability and dispute resolution, will continue.</p>`],
      ['Dispute resolution', `<p>These terms are governed by the laws of India. If a dispute arises, we will first try to resolve it through discussion in good faith. ${law} <!-- LAWYER-REVIEW: governing law, jurisdiction, and whether arbitration should be added --></p>`],
      ['Changes to these terms', `<p>We may update these terms from time to time. The latest version will be on this page with its "last updated" date. Changes do not alter a proposal that you have already accepted for a project in progress.</p>`],
      ['Contact', `<p>${esc(NAME)}<br>Contact us ${contactLine()}.</p>`]
    ]
  });
}

// ------------------------------------------------------------------ REFUND
function refund() {
  return legalPage({
    path: '/refund-policy', title: 'Refund and Cancellation Policy',
    description: `Refund and cancellation policy for ${NAME}: software projects, hosting plans, domains and training.`,
    lead: 'How cancellations and refunds work for our services.',
    sections: [
      ['Scope', `<p>This policy applies to services bought from ${esc(NAME)}. Where your written proposal or order states different terms for your project, the proposal or order prevails.</p>`],
      ['Software and website projects', `<ul>
<li><strong>Before work starts:</strong> if you cancel after approving a proposal but before we have started work, we will refund any advance you have paid, less any costs we have already incurred that cannot be recovered.</li>
<li><strong>After work has started:</strong> you pay for the work completed up to the date of cancellation, including any approved milestone. Any advance paid beyond the value of that work will be refunded.</li>
<li><strong>Completed and delivered work:</strong> fees for work that has been delivered and accepted are not refundable.</li>
<li><strong>Defects:</strong> if delivered work does not meet the agreed scope, we will correct it within the support period stated in your proposal. Where a defect can be fixed, a fix is our remedy in place of a refund.</li>
</ul>
<!-- LAWYER-REVIEW: confirm advance/milestone treatment against the commercial terms the business actually uses -->`],
      ['Hosting plans', `<ul>
<li>You may cancel a hosting plan by giving us written notice. The cancellation takes effect at the end of the billing period that has already been paid for.</li>
<li>Fees for a billing period that has already started are not refunded unless your order states otherwise, or unless we are unable to provide the service you paid for.</li>
<li>The renewal price and any further cancellation conditions for your plan are confirmed to you in writing before you sign up.</li>
</ul>
<!-- LAWYER-REVIEW: refund window, auto-renewal and notice period for hosting -->`],
      ['Domain names and third-party purchases', `<p>Domain registrations, renewals, SSL certificates, payment gateway fees and other purchases made from third parties on your behalf are non-refundable once the third party has processed them, because we cannot recover those fees. This is subject to the third party's own refund rules.</p>`],
      ['Training programmes', `<p>Fees, schedules and refund conditions for training are confirmed in writing at enrolment, and they are separate from the terms for software services. We do not guarantee employment or placement, so lack of a job outcome is not a ground for a refund.</p>`],
      ['How to request a cancellation or refund', `<p>Contact us ${contactLine()}. Please include your name, the service concerned and the reason for your request. We will review it and tell you the outcome in writing. Approved refunds are returned using the original payment method where possible.</p>`],
      ['Changes to this policy', `<p>We may update this policy from time to time. The version in force when you placed your order applies to that order.</p>`]
    ]
  });
}

module.exports = { privacy, terms, refund };
