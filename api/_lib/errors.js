/**
 * Error types shared by the API functions.
 *
 * HttpError    – an expected failure we want to report to the browser
 *                (bad input, wrong method, service not configured…).
 *                createHandler() in http.js turns it into a JSON response.
 * ProviderError – a third-party service (Resend, Mailchimp) refused or
 *                failed a request. Handlers log it and answer 502.
 */

class HttpError extends Error {
  /**
   * @param {number} status  HTTP status code to send.
   * @param {string} code    Short machine-readable error code, e.g. "validation_failed".
   * @param {object} [fields] Per-field messages for validation errors.
   */
  constructor(status, code, fields) {
    super(code);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

class ProviderError extends Error {
  /**
   * @param {string} provider Service name, e.g. "resend".
   * @param {number} status   HTTP status the service answered with (0 if none).
   * @param {string} detail   Response body or reason, for the server log only.
   */
  constructor(provider, status, detail) {
    super(`${provider} request failed (${status}): ${detail}`);
    this.name = 'ProviderError';
    this.provider = provider;
    this.status = status;
  }
}

module.exports = { HttpError, ProviderError };
