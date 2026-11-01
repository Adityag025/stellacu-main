const test = require('node:test');
const assert = require('node:assert/strict');
const { createContactHandler } = require('../api/contact');
const { call, testConfig, spy, quietConsole } = require('./helpers');

const validBody = {
  form: 'growth-audit',
  page: '/start-a-growth-audit.html',
  fields: { name: 'Asha', email: 'Asha@Example.com', phone: '+91 98765 43210', company: 'Acme', message: 'Please call me about an audit.' },
};

function setup(overrides = {}) {
  const sendEmail = overrides.sendEmail || spy();
  const handler = createContactHandler({
    config: overrides.config || testConfig(),
    sendEmail,
    now: () => new Date('2026-11-01T10:00:00Z'),
  });
  return { handler, sendEmail };
}

test('valid enquiry is emailed to the team with reply-to set to the visitor', async () => {
  const { handler, sendEmail } = setup();
  const res = await call(handler, 'POST', validBody);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json, { ok: true });
  assert.equal(sendEmail.calls.length, 1);

  const [message] = sendEmail.calls[0];
  assert.deepEqual(message.to, ['team@example.com']);
  assert.equal(message.from, 'Site <site@example.com>');
  assert.equal(message.replyTo, 'asha@example.com');
  assert.equal(message.subject, 'New enquiry: Start a Growth Audit page');
  assert.match(message.text, /Company: Acme/);
});

test('each landing page form is accepted', async () => {
  const { handler, sendEmail } = setup();
  const landing1 = await call(handler, 'POST', {
    form: 'landing-1',
    fields: { name: 'Asha', email: 'a@example.com', phone: '9876543210', website: 'acme.com', budget: 'over-100k' },
  });
  const landing2 = await call(handler, 'POST', {
    form: 'landing-2',
    fields: { name: 'Asha', email: 'a@example.com', website: 'https://acme.com' },
  });
  assert.equal(landing1.statusCode, 200);
  assert.equal(landing2.statusCode, 200);
  assert.equal(sendEmail.calls.length, 2);
});

test('only POST is allowed', async () => {
  const { handler } = setup();
  const res = await call(handler, 'GET');
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, 'POST');
});

test('unknown form key is rejected', async () => {
  const { handler, sendEmail } = setup();
  const res = await call(handler, 'POST', { ...validBody, form: 'admin' });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json.error, 'unknown_form');
  assert.equal(sendEmail.calls.length, 0);
});

test('invalid fields return 422 with per-field messages', async () => {
  const { handler, sendEmail } = setup();
  const res = await call(handler, 'POST', { form: 'growth-audit', fields: { email: 'nope' } });
  assert.equal(res.statusCode, 422);
  assert.equal(res.json.error, 'validation_failed');
  assert.deepEqual(Object.keys(res.json.fields).sort(), ['company', 'email', 'message', 'name', 'phone']);
  assert.equal(sendEmail.calls.length, 0);
});

test('malformed JSON returns 400', async () => {
  const { handler } = setup();
  const res = await call(handler, 'POST', '{not json');
  assert.equal(res.statusCode, 400);
  assert.equal(res.json.error, 'invalid_json');
});

test('oversized body returns 413', async () => {
  const { handler } = setup();
  const res = await call(handler, 'POST', { ...validBody, padding: 'x'.repeat(30 * 1024) });
  assert.equal(res.statusCode, 413);
});

test('honeypot submissions look successful but send nothing', async () => {
  const { handler, sendEmail } = setup();
  const res = await call(handler, 'POST', { ...validBody, botcheck: 'on' });
  assert.equal(res.statusCode, 200);
  assert.equal(sendEmail.calls.length, 0);
});

test('missing email settings return 503', async (t) => {
  quietConsole(t);
  const { handler, sendEmail } = setup({ config: testConfig({ mail: { resendApiKey: '' } }) });
  const res = await call(handler, 'POST', validBody);
  assert.equal(res.statusCode, 503);
  assert.equal(res.json.error, 'not_configured');
  assert.equal(sendEmail.calls.length, 0);
});

test('email provider failure returns 502', async (t) => {
  quietConsole(t);
  const { handler } = setup({
    sendEmail: spy(async () => {
      throw new Error('provider down');
    }),
  });
  const res = await call(handler, 'POST', validBody);
  assert.equal(res.statusCode, 502);
  assert.equal(res.json.error, 'delivery_failed');
});

test('works with a body Vercel has already parsed', async () => {
  const { handler, sendEmail } = setup();
  const { fakeRequest, fakeResponse } = require('./helpers');
  const req = fakeRequest('POST');
  req.body = validBody;
  const res = fakeResponse();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(sendEmail.calls.length, 1);
});
