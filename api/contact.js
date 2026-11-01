/**
 * POST /api/contact
 *
 * Receives the Growth Audit and landing page forms and emails each
 * enquiry to the team inbox.
 *
 * Request body:
 *   {
 *     "form": "growth-audit" | "landing-1" | "landing-2",   // see _lib/forms.js
 *     "fields": { "name": "...", "email": "...", ... },
 *     "page": "/start-a-growth-audit.html",                   // optional
 *     "botcheck": ""                                          // honeypot, must be empty
 *   }
 *
 * Responses:
 *   200 { ok: true }
 *   400 { ok: false, error: "unknown_form" | "invalid_json" }
 *   422 { ok: false, error: "validation_failed", fields: { email: "..." } }
 *   502 { ok: false, error: "delivery_failed" }   – email provider refused
 *   503 { ok: false, error: "not_configured" }    – env vars missing
 */

const { readConfig, isMailConfigured } = require('./_lib/config');
const { createHandler, readJsonBody, sendJson, isBot } = require('./_lib/http');
const { HttpError } = require('./_lib/errors');
const { getForm } = require('./_lib/forms');
const { validateFields } = require('./_lib/validation');
const { buildEnquiryEmail } = require('./_lib/email-templates');
const { readPagePath } = require('./_lib/request');
const resend = require('./_lib/providers/resend');

/**
 * Dependencies are injectable so the tests can run without network access.
 */
function createContactHandler({ config = readConfig(), sendEmail = resend.sendEmail, now = () => new Date() } = {}) {
  return createHandler(['POST'], async (req, res) => {
    const body = await readJsonBody(req);

    const form = getForm(body.form);
    if (!form) throw new HttpError(400, 'unknown_form');

    // Bots get a normal success reply so they don't retry; nothing is sent.
    if (isBot(body)) return sendJson(res, 200, { ok: true });

    const { values, errors } = validateFields(form.fields, body.fields);
    if (Object.keys(errors).length) throw new HttpError(422, 'validation_failed', errors);

    if (!isMailConfigured(config)) {
      console.error('[contact] email is not configured: set RESEND_API_KEY, MAIL_FROM and MAIL_TO');
      throw new HttpError(503, 'not_configured');
    }

    const email = buildEnquiryEmail({ form, values, page: readPagePath(body), submittedAt: now() });
    try {
      await sendEmail({
        apiKey: config.mail.resendApiKey,
        from: config.mail.from,
        to: config.mail.to,
        replyTo: values.email,
        ...email,
      });
    } catch (err) {
      console.error('[contact] delivery failed', err);
      throw new HttpError(502, 'delivery_failed');
    }

    sendJson(res, 200, { ok: true });
  });
}

module.exports = createContactHandler();
module.exports.createContactHandler = createContactHandler;
