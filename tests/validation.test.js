const test = require('node:test');
const assert = require('node:assert/strict');
const { validateFields, validateField } = require('../api/_lib/validation');
const { FORMS } = require('../api/_lib/forms');

const growthAudit = FORMS['growth-audit'].fields;
const validGrowthAudit = {
  name: 'Asha Rao',
  email: 'asha@example.com',
  phone: '+91 98765 43210',
  company: 'Acme',
  message: 'We need help with our pipeline.',
};

test('every field on every form is required', () => {
  for (const [key, form] of Object.entries(FORMS)) {
    const { errors } = validateFields(form.fields, {});
    assert.deepEqual(Object.keys(errors).sort(), Object.keys(form.fields).sort(), key);
  }
});

test('a fully valid form has no errors', () => {
  const { errors } = validateFields(growthAudit, validGrowthAudit);
  assert.deepEqual(errors, {});
});

test('required messages', () => {
  assert.equal(validateField(growthAudit.name, '').error, 'This field is required.');
  assert.equal(validateField(FORMS['landing-1'].fields.budget, '').error, 'Please choose an option.');
});

test('values are trimmed, email lower-cased, text whitespace collapsed', () => {
  const { values } = validateFields(growthAudit, { ...validGrowthAudit, name: '  Asha   Rao ', email: ' Asha@Example.COM ' });
  assert.equal(values.name, 'Asha Rao');
  assert.equal(values.email, 'asha@example.com');
});

test('unknown fields are dropped', () => {
  const { values } = validateFields(FORMS['landing-2'].fields, {
    name: 'Asha',
    email: 'a@example.com',
    website: 'example.com',
    admin: 'true',
  });
  assert.equal('admin' in values, false);
});

test('name: letters in any language, with spaces, apostrophes, hyphens, dots', () => {
  for (const ok of ['Asha Rao', "O'Neil", 'Jean-Luc Picard', 'J. R. Smith', 'Zoë', 'अनन्या', 'محمد علي']) {
    assert.equal(validateField(growthAudit.name, ok).error, undefined, ok);
  }
  for (const bad of ['A', 'Asha123', 'asha@example.com', '--', 'Asha!']) {
    assert.ok(validateField(growthAudit.name, bad).error, bad);
  }
});

test('email: needs a domain with a real TLD and no double dots', () => {
  for (const ok of ['a@example.com', 'first.last+tag@sub.example.co.in']) {
    assert.equal(validateField(growthAudit.email, ok).error, undefined, ok);
  }
  for (const bad of ['not-an-email', 'a@b', 'a@b.c', 'a@@b.com', 'a..b@example.com', 'a b@example.com']) {
    assert.equal(validateField(growthAudit.email, bad).error, 'Enter a valid email address.', bad);
  }
});

test('phone: 7 to 15 digits, common separators, + only at the start', () => {
  for (const ok of ['+91 98765 43210', '(080) 4567-8901', '9876543', '+1.415.555.0100']) {
    assert.equal(validateField(growthAudit.phone, ok).error, undefined, ok);
  }
  for (const bad of ['call me', '12345', '1234567890123456', '98+765 43210', '+91 98765 4321x']) {
    assert.ok(validateField(growthAudit.phone, bad).error, bad);
  }
});

test('company: at least 2 characters, any characters allowed', () => {
  assert.equal(validateField(growthAudit.company, '3M').error, undefined);
  assert.equal(validateField(growthAudit.company, 'AT&T').error, undefined);
  assert.equal(validateField(growthAudit.company, 'A').error, 'Please enter at least 2 characters.');
});

test('message: at least 10 characters, at most 5000', () => {
  assert.equal(validateField(growthAudit.message, 'Too short').error, 'Please enter at least 10 characters.');
  assert.equal(validateField(growthAudit.message, 'x'.repeat(5000)).error, undefined);
  assert.equal(validateField(growthAudit.message, 'x'.repeat(5001)).error, 'Please use 5000 characters or fewer.');
});

test('website: https:// optional, must be a public domain', () => {
  const url = FORMS['landing-1'].fields.website;
  assert.equal(validateField(url, 'stellacumedia.com').value, 'https://stellacumedia.com/');
  assert.equal(validateField(url, 'http://example.com/page').value, 'http://example.com/page');
  for (const bad of ['localhost', 'acme', 'example.c0m', '192.168.1.1', 'javascript:alert(1)', 'ftp://example.com']) {
    assert.ok(validateField(url, bad).error, bad);
  }
});

test('budget must be one of the listed options', () => {
  const budget = FORMS['landing-1'].fields.budget;
  assert.equal(validateField(budget, '5k-20k').value, '5k-20k');
  assert.ok(validateField(budget, '1-million').error);
  assert.ok(validateField(budget, 'toString').error);
});

test('over-long values are rejected', () => {
  assert.equal(validateField(growthAudit.name, 'a'.repeat(101)).error, 'Please use 100 characters or fewer.');
  assert.equal(validateField(growthAudit.company, 'x'.repeat(201)).error, 'Please use 200 characters or fewer.');
});

test('non-string values are treated as empty', () => {
  assert.ok(validateField(growthAudit.name, { $gt: '' }).error);
});

test('control characters are stripped', () => {
  assert.equal(validateField(growthAudit.name, 'Asha\u0000\u0007').value, 'Asha');
});
