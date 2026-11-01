/**
 * Small request/response helpers so every API function behaves the same:
 * JSON in, JSON out, consistent error shape.
 *
 * Success:  { "ok": true }
 * Failure:  { "ok": false, "error": "<code>", "fields": { "<field>": "<message>" } }
 *
 * Handlers only use plain Node req/res APIs, so they run unchanged on
 * Vercel, in scripts/dev-server.js and in the tests.
 */

const { HttpError } = require('./errors');
const { readConfig } = require('./config');

const MAX_BODY_BYTES = 20 * 1024;

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function parseJson(text) {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'invalid_json');
  }
}

/** Returns the request body as an object. */
async function readJsonBody(req) {
  // Vercel reads the whole body before our code runs, so check the declared
  // size here; the stream check below covers the local dev server and tests.
  const declaredSize = Number(req.headers && req.headers['content-length']);
  if (declaredSize > MAX_BODY_BYTES) throw new HttpError(413, 'payload_too_large');

  // Vercel parses JSON bodies into req.body; for malformed JSON the getter throws.
  let body;
  try {
    body = req.body;
  } catch {
    throw new HttpError(400, 'invalid_json');
  }
  if (body !== undefined) {
    if (Buffer.isBuffer(body)) return parseJson(body.toString('utf8'));
    if (typeof body === 'string') return parseJson(body);
    return body || {};
  }

  // Plain Node http (local dev server, tests): read the stream ourselves.
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'payload_too_large');
    chunks.push(chunk);
  }
  return parseJson(Buffer.concat(chunks).toString('utf8'));
}

/**
 * Lets the listed websites call the API from the browser (CORS). Needed when
 * the pages are hosted somewhere else (e.g. shared hosting) than the API.
 */
function applyCors(req, res, methods, allowedOrigins) {
  const origin = req.headers && req.headers.origin;
  if (!origin || !allowedOrigins.includes(origin)) return;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', [...methods, 'OPTIONS'].join(', '));
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

/**
 * Wraps a handler with CORS, method checking and error handling.
 *
 * @param {string[]} methods Allowed HTTP methods, e.g. ['POST'].
 * @param {(req, res) => Promise<void>} handle The endpoint logic.
 * @param {object} [options]
 * @param {string[]} [options.allowedOrigins] Defaults to ALLOWED_ORIGINS (config.js).
 */
function createHandler(methods, handle, { allowedOrigins = readConfig().allowedOrigins } = {}) {
  return async function handler(req, res) {
    applyCors(req, res, methods, allowedOrigins);

    // Browser preflight check before a cross-site POST.
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      return res.end();
    }

    if (!methods.includes(req.method)) {
      res.setHeader('Allow', methods.join(', '));
      return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
    }

    try {
      await handle(req, res);
    } catch (err) {
      if (err instanceof HttpError) {
        const payload = { ok: false, error: err.code };
        if (err.fields) payload.fields = err.fields;
        return sendJson(res, err.status, payload);
      }
      console.error('[api] unexpected error', err);
      sendJson(res, 500, { ok: false, error: 'internal_error' });
    }
  };
}

/** Honeypot: real visitors never tick the hidden "botcheck" box. */
function isBot(body) {
  return Boolean(body && body.botcheck);
}

module.exports = { createHandler, readJsonBody, sendJson, isBot, MAX_BODY_BYTES };
