/**
 * The PHP form API (php-api/, on Hostinger) must answer exactly like the
 * Node.js one (api/, on Vercel). Sends the same requests to both and
 * compares status codes and JSON. Only requests that never send email
 * (validation errors, bots, wrong methods) are used.
 *
 *   PHP_API=https://stellacumedia.com/api NODE_API=https://stellacu-main.vercel.app/api \
 *     node --test tests/site/api-parity.site.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const PHP_API = process.env.PHP_API || 'https://stellacumedia.com/api';
const NODE_API = process.env.NODE_API || 'https://stellacu-main.vercel.app/api';

const CASES = [
  ['GET contact', 'contact', { method: 'GET' }],
  ['malformed JSON', 'contact', { body: '{bad' }],
  ['unknown form', 'contact', { json: { form: 'admin' } }],
  ['empty growth-audit', 'contact', { json: { form: 'growth-audit', fields: {} } }],
  ['empty landing-1', 'contact', { json: { form: 'landing-1', fields: {} } }],
  ['empty landing-2', 'contact', { json: { form: 'landing-2' } }],
  ['bot (honeypot)', 'contact', { json: { form: 'landing-2', botcheck: 'on', fields: {} } }],
  [
    'every rule broken',
    'contact',
    { json: { form: 'growth-audit', fields: { name: 'A1', email: 'a@b', phone: '12', company: 'A', message: 'short' } } },
  ],
  [
    'mixed valid/invalid',
    'contact',
    { json: { form: 'landing-1', fields: { name: 'Zoë O\'Neil', email: 'a..b@example.com', phone: '+91 98765 43210', website: '192.168.1.1', budget: 'toString' } } },
  ],
  ['too long', 'contact', { json: { form: 'growth-audit', fields: { name: 'a'.repeat(101), email: 'x', phone: 'x', company: 'x'.repeat(201), message: 'x'.repeat(5001) } } }],
  ['non-string fields', 'contact', { json: { form: 'landing-2', fields: { name: { $gt: '' }, email: ['a'], website: 5 } } }],
  ['over 20 KB', 'contact', { body: JSON.stringify({ form: 'landing-2', pad: 'x'.repeat(30 * 1024) }) }],
  ['subscribe invalid', 'subscribe', { json: { email: 'nope' } }],
  ['subscribe empty', 'subscribe', { json: {} }],
  ['subscribe bot', 'subscribe', { json: { email: 'a@example.com', botcheck: 'on' } }],
  ['GET subscribe', 'subscribe', { method: 'GET' }],
  ['POST health', 'health', { method: 'POST', json: {} }],
];

async function call(base, path, { method = 'POST', json, body }) {
  const init = { method, headers: {} };
  if (json !== undefined || body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = body !== undefined ? body : JSON.stringify(json);
  }
  const res = await fetch(`${base}/${path}`, init);
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = `non-JSON: ${text.slice(0, 80)}`;
  }
  return { status: res.status, body: parsed };
}

for (const [name, path, request] of CASES) {
  test(`PHP and Node APIs agree: ${name}`, async () => {
    const [php, node] = await Promise.all([call(PHP_API, path, request), call(NODE_API, path, request)]);
    assert.deepEqual(php, node);
  });
}

test('PHP health endpoint responds', async () => {
  const res = await call(PHP_API, 'health', { method: 'GET' });
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.backend, 'php');
});
