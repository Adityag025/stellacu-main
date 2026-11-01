/**
 * Field validation for form submissions.
 *
 * A form is described as { fieldName: { label, type, required, options } }
 * (see forms.js). validateFields() checks the submitted values against that
 * description and returns cleaned values plus any per-field errors.
 * Fields that are not in the description are ignored.
 *
 * Keep these rules and messages in sync with the "Website Forms" section of
 * js/app.js, which shows the same checks in the browser.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const PHONE_CHARS_RE = /^\+?[\d\s().-]+$/;
// Letters in any language, joined by spaces, apostrophes, hyphens or dots: "Asha Rao", "O'Neil", "Jean-Luc".
const NAME_RE = /^[\p{L}\p{M}]+(?:[\s'’.-]+[\p{L}\p{M}]+)*\.?$/u;
// Public domains end in a letter TLD (".com", ".in") or an IDN one ("xn--…").
const TLD_RE = /\.(?:[a-z]{2,}|xn--[a-z\d-]+)$/;

// Control characters other than newline/tab never belong in form input.
const CONTROL_CHARS_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

const MESSAGES = {
  required: 'This field is required.',
  choose: 'Please choose an option.',
  minLength: (n) => `Please enter at least ${n} characters.`,
  maxLength: (n) => `Please use ${n} characters or fewer.`,
};

function collapseSpaces(value) {
  return value.replace(/\s+/g, ' ');
}

function toName(value) {
  const name = collapseSpaces(value);
  return NAME_RE.test(name) ? name : null;
}

function toEmail(value) {
  return EMAIL_RE.test(value) && !value.includes('..') ? value.toLowerCase() : null;
}

function toPhone(value) {
  if (!PHONE_CHARS_RE.test(value)) return null;
  const digits = value.replace(/\D/g, '').length;
  return digits >= 7 && digits <= 15 ? collapseSpaces(value) : null;
}

function toHttpUrl(value) {
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!TLD_RE.test(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Each type has length limits and a normalise() that returns the cleaned
 * value, or null when the value is not valid for that type (then
 * `message` is shown).
 */
const FIELD_TYPES = {
  name: {
    minLength: 2,
    maxLength: 100,
    normalise: toName,
    message: 'Use letters only (spaces, apostrophes and hyphens are fine).',
  },
  text: {
    minLength: 2,
    maxLength: 200,
    normalise: collapseSpaces,
  },
  longText: {
    minLength: 10,
    maxLength: 5000,
    normalise: (v) => v,
  },
  email: {
    maxLength: 254,
    normalise: toEmail,
    message: 'Enter a valid email address.',
  },
  phone: {
    maxLength: 30,
    normalise: toPhone,
    message: 'Enter a valid phone number (7 to 15 digits).',
  },
  url: {
    maxLength: 500,
    normalise: toHttpUrl,
    message: 'Enter a valid website address, e.g. example.com.',
  },
  choice: {
    maxLength: 100,
    normalise: (v, field) => (Object.prototype.hasOwnProperty.call(field.options, v) ? v : null),
    message: 'Please choose one of the options.',
  },
};

function validateField(field, rawValue) {
  const type = FIELD_TYPES[field.type];
  if (!type) throw new Error(`Unknown field type "${field.type}"`);

  const value = typeof rawValue === 'string' ? rawValue.replace(CONTROL_CHARS_RE, '').trim() : '';

  if (!value) {
    if (!field.required) return { value: '' };
    return { error: field.type === 'choice' ? MESSAGES.choose : MESSAGES.required };
  }
  if (type.minLength && value.length < type.minLength) return { error: MESSAGES.minLength(type.minLength) };
  if (value.length > type.maxLength) return { error: MESSAGES.maxLength(type.maxLength) };

  const cleaned = type.normalise(value, field);
  if (cleaned === null) return { error: type.message };
  return { value: cleaned };
}

/**
 * @param {object} fields Form description from forms.js.
 * @param {object} input  Submitted values keyed by field name.
 * @returns {{ values: object, errors: object }} errors is empty when valid.
 */
function validateFields(fields, input) {
  const source = input && typeof input === 'object' ? input : {};
  const values = {};
  const errors = {};

  for (const [name, field] of Object.entries(fields)) {
    const result = validateField(field, source[name]);
    if (result.error) errors[name] = result.error;
    else values[name] = result.value;
  }

  return { values, errors };
}

module.exports = { validateFields, validateField, FIELD_TYPES, MESSAGES };
