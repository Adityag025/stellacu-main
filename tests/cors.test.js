const test = require('node:test');
const assert = require('node:assert/strict');
const { createHandler, sendJson } = require('../api/_lib/http');
const { readConfig } = require('../api/_lib/config');
const { fakeRequest, fakeResponse } = require('./helpers');

const ALLOWED = ['https://stellacumedia.com'];
const handler = createHandler(['POST'], async (req, res) => sendJson(res, 200, { ok: true }), { allowedOrigins: ALLOWED });

async function call(method, origin) {
  const req = fakeRequest(method, method === 'POST' ? {} : undefined);
  if (origin) req.headers.origin = origin;
  const res = fakeResponse();
  await handler(req, res);
  return res;
}

test('preflight from an allowed site gets 204 with CORS headers', async () => {
  const res = await call('OPTIONS', 'https://stellacumedia.com');
  assert.equal(res.statusCode, 204);
  assert.equal(res.headers['access-control-allow-origin'], 'https://stellacumedia.com');
  assert.equal(res.headers['access-control-allow-methods'], 'POST, OPTIONS');
  assert.equal(res.headers['access-control-allow-headers'], 'Content-Type');
});

test('POST from an allowed site is answered with its origin allowed', async () => {
  const res = await call('POST', 'https://stellacumedia.com');
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['access-control-allow-origin'], 'https://stellacumedia.com');
});

test('other sites get no CORS headers, so browsers block them', async () => {
  const res = await call('POST', 'https://evil.example');
  assert.equal(res.headers['access-control-allow-origin'], undefined);
});

test('same-site requests (no Origin header) work as before', async () => {
  const res = await call('POST');
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['access-control-allow-origin'], undefined);
});

test('allowed origins come from ALLOWED_ORIGINS, defaulting to the live domain', () => {
  assert.deepEqual(readConfig({}).allowedOrigins, ['https://stellacumedia.com', 'https://www.stellacumedia.com']);
  assert.deepEqual(readConfig({ ALLOWED_ORIGINS: 'https://a.com, https://b.com' }).allowedOrigins, ['https://a.com', 'https://b.com']);
});
