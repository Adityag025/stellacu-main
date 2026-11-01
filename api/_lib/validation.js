/**
 * Field validation for form submissions.
 *
 * A form is described as { fieldName: { label, type, required, options } }
 * (see forms.js). validateFields() checks the submitted values against that
 * description and returns cleaned values plus any per-field errors.
 * Fields that are not in the description are ignored.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+()\d\s.-]{6,30}$/;

// Control characters other than newline/tab never belong in form input.
const CONTROL_CHARS_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function toHttpUrl(value) {
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname.includes('.')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Each type has a length limit and a normalise() that returns the cleaned
 * value, or null when the value is not valid for that type.
 */
const FIELD_TYPES = {
  text: {
    maxLength: 200,
    normalise: (v) => v.replace(/\s+/g, ' '),
  },
  longText: {
    maxLength: 5000,
    normalise: (v) => v,
  },
  email: {
    maxLength: 254,
    normalise: (v) => (EMAIL_RE.test(v) ? v.toLowerCase() : null),
    message: 'Enter a valid email address.',
  },
  phone: {
    maxLength: 30,
    normalise: (v) => (PHONE_RE.test(v) ? v : null),
    message: 'Enter a valid phone number.',
  },
  url: {
    maxLength: 500,
    normalise: toHttpUrl,
    message: 'Enter a valid website address.',
  },
  choice: {
    maxLength: 100,
    normalise: (v, field) => (Object.prototype.hasOwnProperty.call(field.options, v) ? v : null),
    message: 'Choose one of the options.',
  },
};

function validateField(field, rawValue) {
  const type = FIELD_TYPES[field.type];
  if (!type) throw new Error(`Unknown field type "${field.type}"`);

  const value = typeof rawValue === 'string' ? rawValue.replace(CONTROL_CHARS_RE, '').trim() : '';

  if (!value) {
    return field.required ? { error: `${field.label} is required.` } : { value: '' };
  }
  if (value.length > type.maxLength) {
    return { error: `${field.label} must be ${type.maxLength} characters or fewer.` };
  }

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

module.exports = { validateFields, validateField, FIELD_TYPES };
