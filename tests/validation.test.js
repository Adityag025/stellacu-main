const test = require('node:test');
const assert = require('node:assert/strict');
const { validateFields, validateField } = require('../api/_lib/validation');
const { FORMS } = require('../api/_lib/forms');

test('required fields are reported when missing', () => {
  const { errors } = validateFields(FORMS['growth-audit'].fields, {});
  assert.deepEqual(Object.keys(errors).sort(), ['company', 'email', 'name']);
});

test('optional fields may be empty', () => {
  const { values, errors } = validateFields(FORMS['growth-audit'].fields, {
    name: 'Asha',
    email: 'asha@example.com',
    company: 'Acme',
  });
  assert.deepEqual(errors, {});
  assert.equal(values.phone, '');
  assert.equal(values.message, '');
});

test('values are trimmed, email lower-cased, text whitespace collapsed', () => {
  const { values } = validateFields(FORMS['growth-audit'].fields, {
    name: '  Asha   Rao ',
    email: ' Asha@Example.COM ',
    company: 'Acme',
  });
  assert.equal(values.name, 'Asha Rao');
  assert.equal(values.email, 'asha@example.com');
});

test('unknown fields are dropped', () => {
  const { values } = validateFields(FORMS['landing-2'].fields, {
    name: 'A',
    email: 'a@example.com',
    website: 'example.com',
    admin: 'true',
  });
  assert.equal('admin' in values, false);
});

test('invalid email is rejected', () => {
  assert.ok(validateField({ label: 'Email', type: 'email', required: true }, 'not-an-email').error);
});

test('phone accepts common formats and rejects letters', () => {
  const phone = { label: 'Phone', type: 'phone' };
  assert.equal(validateField(phone, '+91 98765-43210').value, '+91 98765-43210');
  assert.ok(validateField(phone, 'call me').error);
});

test('website gets https:// added and must be a real host', () => {
  const url = { label: 'Website', type: 'url', required: true };
  assert.equal(validateField(url, 'stellacumedia.com').value, 'https://stellacumedia.com/');
  assert.equal(validateField(url, 'http://example.com/page').value, 'http://example.com/page');
  assert.ok(validateField(url, 'localhost').error);
  assert.ok(validateField(url, 'javascript:alert(1)').error);
});

test('budget must be one of the listed options', () => {
  const budget = FORMS['landing-1'].fields.budget;
  assert.equal(validateField(budget, '5k-20k').value, '5k-20k');
  assert.ok(validateField(budget, '1-million').error);
  assert.ok(validateField(budget, 'toString').error);
});

test('over-long values are rejected', () => {
  assert.ok(validateField({ label: 'Name', type: 'text' }, 'x'.repeat(201)).error);
  assert.equal(validateField({ label: 'Message', type: 'longText' }, 'x'.repeat(5000)).value.length, 5000);
});

test('non-string values are treated as empty', () => {
  assert.ok(validateField({ label: 'Name', type: 'text', required: true }, { $gt: '' }).error);
});

test('control characters are stripped', () => {
  assert.equal(validateField({ label: 'Name', type: 'text' }, 'Asha\u0000\u0007').value, 'Asha');
});
