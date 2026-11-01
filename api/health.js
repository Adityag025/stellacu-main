/**
 * GET /api/health
 *
 * Quick check that the API is deployed and which integrations are set up.
 * Reports only true/false, never the values of any settings.
 *
 *   200 { ok: true, email: true, newsletter: "mailchimp" | "email" | "none" }
 */

const { readConfig, isMailConfigured, isMailchimpConfigured } = require('./_lib/config');
const { createHandler, sendJson } = require('./_lib/http');

function createHealthHandler({ config = readConfig() } = {}) {
  return createHandler(['GET'], async (req, res) => {
    const email = isMailConfigured(config);
    let newsletter = 'none';
    if (isMailchimpConfigured(config)) newsletter = 'mailchimp';
    else if (email) newsletter = 'email';

    sendJson(res, 200, { ok: true, email, newsletter });
  });
}

module.exports = createHealthHandler();
module.exports.createHealthHandler = createHealthHandler;
