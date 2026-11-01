/**
 * Fakes for calling API handlers directly in tests, without a server.
 */

const { Readable } = require('node:stream');

/** A Node-style request whose body is streamed like a real one. */
function fakeRequest(method, body) {
  const raw = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body);
  const req = Readable.from(raw ? [Buffer.from(raw)] : []);
  req.method = method;
  req.headers = { 'content-type': 'application/json' };
  return req;
}

/** Captures what a handler writes; read status/headers/json after awaiting the handler. */
function fakeResponse() {
  const res = {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end(chunk) {
      this.body = chunk || '';
    },
    get json() {
      return JSON.parse(this.body);
    },
  };
  return res;
}

async function call(handler, method, body) {
  const res = fakeResponse();
  await handler(fakeRequest(method, body), res);
  return res;
}

/** Config with every integration filled in; override parts per test. */
function testConfig(overrides = {}) {
  return {
    mail: { resendApiKey: 're_test', from: 'Site <site@example.com>', to: ['team@example.com'], ...overrides.mail },
    mailchimp: { apiKey: '', audienceId: '', doubleOptIn: true, ...overrides.mailchimp },
  };
}

/** Records calls; optionally fails. */
function spy(impl = async () => ({ id: 'test' })) {
  const fn = async (...args) => {
    fn.calls.push(args);
    return impl(...args);
  };
  fn.calls = [];
  return fn;
}

/** A fetch stand-in returning a fixed response and recording requests. */
function fakeFetch(status, body) {
  const fn = async (url, options) => {
    fn.calls.push({ url, options });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  };
  fn.calls = [];
  return fn;
}

// Silence expected error logs from handlers during tests.
function quietConsole(t) {
  const original = console.error;
  console.error = () => {};
  t.after(() => {
    console.error = original;
  });
}

module.exports = { fakeRequest, fakeResponse, call, testConfig, spy, fakeFetch, quietConsole };
