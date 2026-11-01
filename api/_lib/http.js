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
  // Vercel has already parsed JSON bodies into req.body.
  if (req.body !== undefined) {
    if (Buffer.isBuffer(req.body)) return parseJson(req.body.toString('utf8'));
    if (typeof req.body === 'string') return parseJson(req.body);
    return req.body || {};
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
 * Wraps a handler with method checking and error handling.
 *
 * @param {string[]} methods Allowed HTTP methods, e.g. ['POST'].
 * @param {(req, res) => Promise<void>} handle The endpoint logic.
 */
function createHandler(methods, handle) {
  return async function handler(req, res) {
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
