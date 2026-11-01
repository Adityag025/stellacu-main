/**
 * Sends email through Resend (https://resend.com) using its HTTP API.
 *
 * To switch email provider, write another module with the same sendEmail()
 * signature and change the require() in api/contact.js and api/subscribe.js.
 */

const { ProviderError } = require('../errors');

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/**
 * @param {object}   message
 * @param {string}   message.apiKey
 * @param {string}   message.from
 * @param {string[]} message.to
 * @param {string}   [message.replyTo]
 * @param {string}   message.subject
 * @param {string}   message.text
 * @param {string}   message.html
 * @param {typeof fetch} [fetchImpl] Injected in tests.
 * @returns {Promise<{ id: string }>}
 */
async function sendEmail({ apiKey, from, to, replyTo, subject, text, html }, fetchImpl = fetch) {
  const payload = { from, to, subject, text, html };
  if (replyTo) payload.reply_to = replyTo;

  const response = await fetchImpl(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new ProviderError('resend', response.status, detail);
  }
  return response.json();
}

module.exports = { sendEmail, RESEND_ENDPOINT };
