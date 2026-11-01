/**
 * Builds the notification emails the team receives.
 * Every value from a visitor is HTML-escaped before it goes into the HTML part.
 */

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Shows choice fields by their label (e.g. "$5,000 - $20,000 / mo"), not their code. */
function displayValue(field, value) {
  if (field.type === 'choice') return field.options[value] || value;
  return value;
}

function formatDate(date) {
  return date.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
}

function renderHtml(title, rows) {
  const body = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 16px 6px 0;color:#666;vertical-align:top;white-space:nowrap">${escapeHtml(label)}</td>` +
        `<td style="padding:6px 0;white-space:pre-wrap">${escapeHtml(value)}</td></tr>`
    )
    .join('');
  return (
    `<div style="font-family:Arial,sans-serif;font-size:14px;color:#161616">` +
    `<h2 style="font-size:18px;margin:0 0 16px">${escapeHtml(title)}</h2>` +
    `<table style="border-collapse:collapse">${body}</table></div>`
  );
}

function renderText(title, rows) {
  return [title, '', ...rows.map(([label, value]) => `${label}: ${value}`)].join('\n');
}

/**
 * @param {object} args
 * @param {object} args.form        Definition from forms.js.
 * @param {object} args.values      Validated values.
 * @param {string} [args.page]      Path of the page the form was sent from.
 * @param {Date}   args.submittedAt
 */
function buildEnquiryEmail({ form, values, page, submittedAt }) {
  const rows = Object.entries(form.fields)
    .filter(([name]) => values[name])
    .map(([name, field]) => [field.label, displayValue(field, values[name])]);
  if (page) rows.push(['Page', page]);
  rows.push(['Received', formatDate(submittedAt)]);

  return {
    subject: form.subject,
    text: renderText(form.subject, rows),
    html: renderHtml(form.subject, rows),
  };
}

function buildSubscriberEmail({ email, page, submittedAt }) {
  const subject = 'New newsletter signup';
  const rows = [['Email', email]];
  if (page) rows.push(['Page', page]);
  rows.push(['Received', formatDate(submittedAt)]);

  return { subject, text: renderText(subject, rows), html: renderHtml(subject, rows) };
}

module.exports = { buildEnquiryEmail, buildSubscriberEmail, escapeHtml };
