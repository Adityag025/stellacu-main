/**
 * POST /api/subscribe
 *
 * Footer "Subscribe to our insights" form.
 *
 * Where the address goes:
 *   - Mailchimp audience, when MAILCHIMP_API_KEY and MAILCHIMP_AUDIENCE_ID are set;
 *   - otherwise an email to the team inbox (MAIL_TO), so no signup is lost
 *     before a mailing list exists.
 *
 * Request body:  { "email": "...", "page": "/index.html", "botcheck": "" }
 *
 * Responses:
 *   200 { ok: true }
 *   422 { ok: false, error: "validation_failed", fields: { email: "..." } }
 *   502 { ok: false, error: "delivery_failed" }
 *   503 { ok: false, error: "not_configured" }
 */

const { readConfig, isMailConfigured, isMailchimpConfigured } = require('./_lib/config');
const { createHandler, readJsonBody, sendJson, isBot } = require('./_lib/http');
const { HttpError } = require('./_lib/errors');
const { validateFields } = require('./_lib/validation');
const { buildSubscriberEmail } = require('./_lib/email-templates');
const { readPagePath } = require('./_lib/request');
const resend = require('./_lib/providers/resend');
const mailchimp = require('./_lib/providers/mailchimp');

const SUBSCRIBE_FIELDS = {
  email: { label: 'Email', type: 'email', required: true },
};

function createSubscribeHandler({
  config = readConfig(),
  sendEmail = resend.sendEmail,
  addSubscriber = mailchimp.addSubscriber,
  now = () => new Date(),
} = {}) {
  return createHandler(['POST'], async (req, res) => {
    const body = await readJsonBody(req);

    if (isBot(body)) return sendJson(res, 200, { ok: true });

    const { values, errors } = validateFields(SUBSCRIBE_FIELDS, body);
    if (Object.keys(errors).length) throw new HttpError(422, 'validation_failed', errors);

    try {
      if (isMailchimpConfigured(config)) {
        await addSubscriber({
          apiKey: config.mailchimp.apiKey,
          audienceId: config.mailchimp.audienceId,
          email: values.email,
          doubleOptIn: config.mailchimp.doubleOptIn,
        });
      } else if (isMailConfigured(config)) {
        const email = buildSubscriberEmail({ email: values.email, page: readPagePath(body), submittedAt: now() });
        await sendEmail({
          apiKey: config.mail.resendApiKey,
          from: config.mail.from,
          to: config.mail.to,
          replyTo: values.email,
          ...email,
        });
      } else {
        console.error('[subscribe] not configured: set MAILCHIMP_* or RESEND_API_KEY, MAIL_FROM and MAIL_TO');
        throw new HttpError(503, 'not_configured');
      }
    } catch (err) {
      if (err instanceof HttpError) throw err;
      console.error('[subscribe] delivery failed', err);
      throw new HttpError(502, 'delivery_failed');
    }

    sendJson(res, 200, { ok: true });
  });
}

module.exports = createSubscribeHandler();
module.exports.createSubscribeHandler = createSubscribeHandler;
