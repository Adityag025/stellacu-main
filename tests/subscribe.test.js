const test = require('node:test');
const assert = require('node:assert/strict');
const { createSubscribeHandler } = require('../api/subscribe');
const { createHealthHandler } = require('../api/health');
const { call, testConfig, spy, quietConsole } = require('./helpers');

const mailchimpConfig = testConfig({ mailchimp: { apiKey: 'key-us10', audienceId: 'list1' } });

function setup(config) {
  const sendEmail = spy();
  const addSubscriber = spy();
  const handler = createSubscribeHandler({ config, sendEmail, addSubscriber });
  return { handler, sendEmail, addSubscriber };
}

test('goes to Mailchimp when it is configured', async () => {
  const { handler, sendEmail, addSubscriber } = setup(mailchimpConfig);
  const res = await call(handler, 'POST', { email: 'Reader@Example.com' });

  assert.equal(res.statusCode, 200);
  assert.equal(addSubscriber.calls.length, 1);
  assert.equal(addSubscriber.calls[0][0].email, 'reader@example.com');
  assert.equal(addSubscriber.calls[0][0].doubleOptIn, true);
  assert.equal(sendEmail.calls.length, 0);
});

test('falls back to emailing the team without Mailchimp', async () => {
  const { handler, sendEmail, addSubscriber } = setup(testConfig());
  const res = await call(handler, 'POST', { email: 'reader@example.com', page: '/index.html' });

  assert.equal(res.statusCode, 200);
  assert.equal(addSubscriber.calls.length, 0);
  assert.equal(sendEmail.calls.length, 1);
  assert.equal(sendEmail.calls[0][0].subject, 'New newsletter signup');
});

test('invalid email returns 422', async () => {
  const { handler } = setup(testConfig());
  const res = await call(handler, 'POST', { email: 'nope' });
  assert.equal(res.statusCode, 422);
  assert.ok(res.json.fields.email);
});

test('honeypot submissions send nothing', async () => {
  const { handler, sendEmail, addSubscriber } = setup(mailchimpConfig);
  const res = await call(handler, 'POST', { email: 'bot@example.com', botcheck: 'on' });
  assert.equal(res.statusCode, 200);
  assert.equal(sendEmail.calls.length + addSubscriber.calls.length, 0);
});

test('nothing configured returns 503', async (t) => {
  quietConsole(t);
  const { handler } = setup(testConfig({ mail: { resendApiKey: '' } }));
  const res = await call(handler, 'POST', { email: 'reader@example.com' });
  assert.equal(res.statusCode, 503);
});

test('Mailchimp failure returns 502', async (t) => {
  quietConsole(t);
  const handler = createSubscribeHandler({
    config: mailchimpConfig,
    addSubscriber: spy(async () => {
      throw new Error('mailchimp down');
    }),
  });
  const res = await call(handler, 'POST', { email: 'reader@example.com' });
  assert.equal(res.statusCode, 502);
});

test('health reports configured services', async () => {
  const full = await call(createHealthHandler({ config: mailchimpConfig }), 'GET');
  assert.deepEqual(full.json, { ok: true, email: true, newsletter: 'mailchimp' });

  const none = await call(createHealthHandler({ config: testConfig({ mail: { to: [] } }) }), 'GET');
  assert.deepEqual(none.json, { ok: true, email: false, newsletter: 'none' });

  const post = await call(createHealthHandler({ config: mailchimpConfig }), 'POST');
  assert.equal(post.statusCode, 405);
});
