/**
 * Adds newsletter subscribers to a Mailchimp audience (Marketing API v3).
 *
 * Uses PUT on the member's hash, so subscribing an address that is already
 * on the list succeeds instead of erroring.
 */

const crypto = require('node:crypto');
const { ProviderError } = require('../errors');

/** Mailchimp keys end in the data-centre, e.g. "abc123-us10" → "us10". */
function dataCentreFromKey(apiKey) {
  const dc = String(apiKey).split('-').pop();
  if (!/^[a-z]+\d+$/.test(dc)) {
    throw new ProviderError('mailchimp', 0, 'API key has no data-centre suffix (e.g. "-us10")');
  }
  return dc;
}

function memberUrl(apiKey, audienceId, email) {
  const hash = crypto.createHash('md5').update(email.toLowerCase()).digest('hex');
  return `https://${dataCentreFromKey(apiKey)}.api.mailchimp.com/3.0/lists/${encodeURIComponent(audienceId)}/members/${hash}`;
}

/**
 * @param {object}  args
 * @param {string}  args.apiKey
 * @param {string}  args.audienceId
 * @param {string}  args.email
 * @param {boolean} args.doubleOptIn true: new subscribers get a confirmation email first.
 * @param {typeof fetch} [fetchImpl] Injected in tests.
 */
async function addSubscriber({ apiKey, audienceId, email, doubleOptIn }, fetchImpl = fetch) {
  const response = await fetchImpl(memberUrl(apiKey, audienceId, email), {
    method: 'PUT',
    headers: {
      Authorization: `Basic ${Buffer.from(`stellacu:${apiKey}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email_address: email,
      status_if_new: doubleOptIn ? 'pending' : 'subscribed',
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new ProviderError('mailchimp', response.status, detail);
  }
  return response.json();
}

module.exports = { addSubscriber, memberUrl, dataCentreFromKey };
