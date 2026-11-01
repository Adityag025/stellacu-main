const test = require('node:test');
const assert = require('node:assert/strict');
const resend = require('../api/_lib/providers/resend');
const mailchimp = require('../api/_lib/providers/mailchimp');
const { readConfig, isMailConfigured, isMailchimpConfigured } = require('../api/_lib/config');
const { ProviderError } = require('../api/_lib/errors');
const { fakeFetch } = require('./helpers');

const message = {
  apiKey: 're_123',
  from: 'Site <site@example.com>',
  to: ['team@example.com'],
  replyTo: 'visitor@example.com',
  subject: 'Hi',
  text: 'Hi',
  html: '<p>Hi</p>',
};

test('Resend: sends the right request', async () => {
  const fetch = fakeFetch(200, { id: 'email_1' });
  const result = await resend.sendEmail(message, fetch);

  assert.deepEqual(result, { id: 'email_1' });
  const { url, options } = fetch.calls[0];
  assert.equal(url, resend.RESEND_ENDPOINT);
  assert.equal(options.method, 'POST');
  assert.equal(options.headers.Authorization, 'Bearer re_123');
  const body = JSON.parse(options.body);
  assert.equal(body.reply_to, 'visitor@example.com');
  assert.deepEqual(body.to, ['team@example.com']);
});

test('Resend: error responses throw ProviderError', async () => {
  await assert.rejects(resend.sendEmail(message, fakeFetch(403, { message: 'domain not verified' })), ProviderError);
});

test('Mailchimp: upserts the member with double opt-in', async () => {
  const fetch = fakeFetch(200, { status: 'pending' });
  await mailchimp.addSubscriber(
    { apiKey: 'abc-us10', audienceId: 'list1', email: 'Reader@Example.com', doubleOptIn: true },
    fetch
  );

  const { url, options } = fetch.calls[0];
  // md5("reader@example.com")
  assert.equal(url, 'https://us10.api.mailchimp.com/3.0/lists/list1/members/baa0f4114eafbdd39ce828d01b849ae6');
  assert.equal(options.method, 'PUT');
  assert.deepEqual(JSON.parse(options.body), { email_address: 'Reader@Example.com', status_if_new: 'pending' });
});

test('Mailchimp: rejects keys without a valid data-centre', () => {
  assert.throws(() => mailchimp.dataCentreFromKey('abc'), ProviderError);
  assert.throws(() => mailchimp.dataCentreFromKey('abc-evil.com/x'), ProviderError);
  assert.equal(mailchimp.dataCentreFromKey('abc-us10'), 'us10');
});

test('Mailchimp: error responses throw ProviderError', async () => {
  const fetch = fakeFetch(400, { title: 'Invalid Resource' });
  await assert.rejects(
    mailchimp.addSubscriber({ apiKey: 'abc-us10', audienceId: 'l', email: 'a@example.com', doubleOptIn: true }, fetch),
    ProviderError
  );
});

test('config: reads env vars and splits MAIL_TO', () => {
  const config = readConfig({
    RESEND_API_KEY: 're_1',
    MAIL_FROM: 'Site <s@example.com>',
    MAIL_TO: 'a@example.com, b@example.com',
    MAILCHIMP_DOUBLE_OPT_IN: 'false',
  });
  assert.deepEqual(config.mail.to, ['a@example.com', 'b@example.com']);
  assert.equal(config.mailchimp.doubleOptIn, false);
  assert.equal(isMailConfigured(config), true);
  assert.equal(isMailchimpConfigured(config), false);
  assert.equal(isMailConfigured(readConfig({})), false);
});
