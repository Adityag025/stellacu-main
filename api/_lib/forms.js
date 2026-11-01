/**
 * Every form on the website that posts to /api/contact.
 *
 * The browser sends { form: "<key>", fields: { ... } }. The key picks one of
 * the definitions below, which decides the email subject and which fields
 * are accepted and required. The subject lives here, not in the HTML, so a
 * visitor cannot change it.
 *
 * To add a form:
 *   1. Add an entry here with a new key.
 *   2. In the HTML give the <form> data-form="<key>" and id="contact-form"
 *      (or add its id to the submit handler in js/app.js), and name each
 *      input after a field below.
 */

const BUDGET_OPTIONS = {
  'under-5k': 'Less than $5,000 / mo',
  '5k-20k': '$5,000 - $20,000 / mo',
  '20k-100k': '$20,000 - $100,000 / mo',
  'over-100k': 'More than $100,000 / mo',
};

const FORMS = {
  // start-a-growth-audit.html
  'growth-audit': {
    subject: 'New enquiry: Start a Growth Audit page',
    fields: {
      name: { label: 'Name', type: 'text', required: true },
      email: { label: 'Email', type: 'email', required: true },
      phone: { label: 'Phone', type: 'phone' },
      company: { label: 'Company', type: 'text', required: true },
      message: { label: 'Message', type: 'longText' },
    },
  },

  // landing-1.html
  'landing-1': {
    subject: 'New Growth Audit request: Landing page 1',
    fields: {
      name: { label: 'Name', type: 'text', required: true },
      email: { label: 'Email', type: 'email', required: true },
      phone: { label: 'Phone', type: 'phone' },
      website: { label: 'Website', type: 'url', required: true },
      budget: { label: 'Monthly budget', type: 'choice', required: true, options: BUDGET_OPTIONS },
    },
  },

  // landing-2.html
  'landing-2': {
    subject: 'New Growth Audit request: Landing page 2',
    fields: {
      name: { label: 'Name', type: 'text', required: true },
      email: { label: 'Email', type: 'email', required: true },
      website: { label: 'Website', type: 'url', required: true },
    },
  },
};

function getForm(key) {
  return Object.prototype.hasOwnProperty.call(FORMS, key) ? FORMS[key] : null;
}

module.exports = { FORMS, BUDGET_OPTIONS, getForm };
