/**
 * Backend settings, read from environment variables.
 *
 * Production: Vercel → Project → Settings → Environment Variables.
 * Local:      copy .env.example to .env.local and fill it in.
 *
 * Nothing here is required for the site itself to load. Without the mail
 * settings the form endpoints answer 503 "not_configured" and log which
 * variables are missing.
 */

function splitList(value) {
  return (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function readConfig(env = process.env) {
  return {
    mail: {
      resendApiKey: env.RESEND_API_KEY || '',
      // Sender shown on notification emails, e.g. "StellAcu Website <website@stellacumedia.com>".
      // The domain must be verified in Resend.
      from: env.MAIL_FROM || '',
      // Inbox(es) that receive enquiries. Comma-separated for several.
      to: splitList(env.MAIL_TO),
    },
    mailchimp: {
      apiKey: env.MAILCHIMP_API_KEY || '',
      audienceId: env.MAILCHIMP_AUDIENCE_ID || '',
      // true: Mailchimp emails the subscriber a confirmation link first (recommended).
      doubleOptIn: env.MAILCHIMP_DOUBLE_OPT_IN !== 'false',
    },
  };
}

function isMailConfigured(config) {
  return Boolean(config.mail.resendApiKey && config.mail.from && config.mail.to.length);
}

function isMailchimpConfigured(config) {
  return Boolean(config.mailchimp.apiKey && config.mailchimp.audienceId);
}

module.exports = { readConfig, isMailConfigured, isMailchimpConfigured };
