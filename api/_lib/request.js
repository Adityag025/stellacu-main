/**
 * Helpers for reading the common parts of a form submission body.
 */

/** The page path the browser reports, e.g. "/landing-1.html". Only used as info in the email. */
function readPagePath(body) {
  const page = body && typeof body.page === 'string' ? body.page.trim() : '';
  return /^\/[\w\-./]{0,200}$/.test(page) ? page : '';
}

module.exports = { readPagePath };
