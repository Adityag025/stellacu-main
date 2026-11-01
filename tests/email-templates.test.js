const test = require('node:test');
const assert = require('node:assert/strict');
const { buildEnquiryEmail, buildSubscriberEmail, escapeHtml } = require('../api/_lib/email-templates');
const { FORMS } = require('../api/_lib/forms');

const submittedAt = new Date('2026-11-01T10:30:00Z');

test('enquiry email uses the form subject and lists filled fields', () => {
  const email = buildEnquiryEmail({
    form: FORMS['landing-1'],
    values: { name: 'Asha', email: 'asha@example.com', phone: '', website: 'https://acme.com/', budget: '5k-20k' },
    page: '/landing-1.html',
    submittedAt,
  });
  assert.equal(email.subject, 'New Growth Audit request: Landing page 1');
  assert.match(email.text, /Name: Asha/);
  assert.match(email.text, /Monthly budget: \$5,000 - \$20,000 \/ mo/);
  assert.match(email.text, /Page: \/landing-1\.html/);
  assert.match(email.text, /Received: 2026-11-01 10:30:00 UTC/);
  assert.doesNotMatch(email.text, /Phone:/, 'empty optional fields are left out');
});

test('visitor input is HTML-escaped', () => {
  const email = buildEnquiryEmail({
    form: FORMS['growth-audit'],
    values: { name: '<script>alert(1)</script>', email: 'a@example.com', company: 'A & B', message: '' },
    submittedAt,
  });
  assert.doesNotMatch(email.html, /<script>/);
  assert.match(email.html, /&lt;script&gt;/);
  assert.match(email.html, /A &amp; B/);
});

test('escapeHtml covers quotes', () => {
  assert.equal(escapeHtml(`"'`), '&quot;&#39;');
});

test('subscriber email', () => {
  const email = buildSubscriberEmail({ email: 'a@example.com', page: '/index.html', submittedAt });
  assert.equal(email.subject, 'New newsletter signup');
  assert.match(email.text, /Email: a@example\.com/);
});
