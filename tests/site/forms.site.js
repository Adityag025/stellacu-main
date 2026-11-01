/**
 * Form field validation in the browser (js/app.js "Website Forms").
 * Requests to /api are intercepted and answered here, so these tests never
 * send email and work without any API keys.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { launch, openPage, sleep } = require('./browser');

const OK = { status: 200, contentType: 'application/json', body: '{"ok":true}' };

/** Opens a page whose /api POSTs are recorded and answered with `reply`. */
async function openForm(browser, path, reply = OK) {
  const sent = [];
  const alerts = [];
  const { page } = await openPage(browser, path, undefined, {
    beforeLoad: async (p) => {
      p.on('dialog', async (d) => {
        alerts.push(d.message());
        await d.dismiss();
      });
      await p.setRequestInterception(true);
      p.on('request', (req) => {
        if (req.url().includes('/api/') && req.method() === 'POST') {
          sent.push(JSON.parse(req.postData()));
          return req.respond(reply);
        }
        return req.continue();
      });
    },
  });
  return { page, sent, alerts };
}

/** Types a value into a field, leaves it, returns the message shown under it ('' if none). */
function setField(page, form, name, value) {
  return page.evaluate(
    (formSel, field, val) => {
      const input = document.querySelector(`${formSel} [name=${field}]`);
      window.jQuery(input).val(val).trigger('input').trigger('change').trigger('blur');
      const error = input.parentElement.querySelector('.field-error');
      return error ? error.textContent : '';
    },
    form,
    name,
    value
  );
}

async function submit(page, form) {
  await page.evaluate((sel) => window.jQuery(sel).trigger('submit'), form);
  await sleep(600);
}

function errorFields(page, form) {
  return page.evaluate(
    (sel) => [...document.querySelectorAll(`${sel} .field-error`)].map((e) => e.previousElementSibling.name).sort(),
    form
  );
}

const FIELD_CASES = {
  name: [
    ['Asha Rao', ''],
    ["O'Neil", ''],
    ['Zoë', ''],
    ['A', 'Please enter at least 2 characters.'],
    ['Asha123', 'Use letters only (spaces, apostrophes and hyphens are fine).'],
  ],
  email: [
    ['a@example.com', ''],
    ['a@b', 'Enter a valid email address.'],
    ['a..b@example.com', 'Enter a valid email address.'],
  ],
  phone: [
    ['+91 98765 43210', ''],
    ['12345', 'Enter a valid phone number (7 to 15 digits).'],
    ['call me', 'Enter a valid phone number (7 to 15 digits).'],
  ],
  company: [
    ['3M', ''],
    ['A', 'Please enter at least 2 characters.'],
  ],
  message: [
    ['Need help with SEO.', ''],
    ['Too short', 'Please enter at least 10 characters.'],
  ],
  website: [
    ['acme.com', ''],
    ['acme', 'Enter a valid website address, e.g. example.com.'],
    ['192.168.1.1', 'Enter a valid website address, e.g. example.com.'],
  ],
};

const FORMS = [
  {
    path: '/start-a-growth-audit',
    form: '#contact-form',
    valid: { name: 'Asha Rao', email: 'asha@example.com', phone: '+91 98765 43210', company: 'Acme', message: 'Need help with SEO.' },
  },
  {
    path: '/landing-1',
    form: '#audit-form',
    valid: { name: 'Asha Rao', email: 'asha@example.com', phone: '+91 98765 43210', website: 'acme.com', budget: '5k-20k' },
  },
  {
    path: '/landing-2',
    form: '#audit-form',
    valid: { name: 'Asha Rao', email: 'asha@example.com', website: 'acme.com' },
  },
  { path: '/', form: '.notify-form', valid: { email: 'reader@example.com' } },
];

for (const { path, form, valid } of FORMS) {
  test(`forms: ${path} ${form}`, async (t) => {
    const browser = await launch();
    try {
      const { page, sent } = await openForm(browser, path);

      await t.test('empty submit flags every field and sends nothing', async () => {
        await submit(page, form);
        assert.deepEqual(await errorFields(page, form), Object.keys(valid).sort());
        assert.equal(sent.length, 0);
      });

      await t.test('each field shows the right message', async () => {
        for (const name of Object.keys(valid)) {
          for (const [value, expected] of FIELD_CASES[name] || []) {
            assert.equal(await setField(page, form, name, value), expected, `${name}="${value}"`);
          }
        }
      });

      await t.test('a valid form is sent with the field values', async () => {
        for (const [name, value] of Object.entries(valid)) await setField(page, form, name, value);
        await submit(page, form);
        assert.deepEqual(await errorFields(page, form), []);
        assert.equal(sent.length, 1);
        const body = sent[0];
        const fields = body.fields || { email: body.email };
        for (const [name, value] of Object.entries(valid)) assert.equal(fields[name], value, name);
      });
    } finally {
      await browser.close();
    }
  });
}

test('forms: server field errors appear under the field, without an alert', async () => {
  const browser = await launch();
  try {
    const reply = {
      status: 422,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: 'validation_failed', fields: { email: 'Enter a valid email address.' } }),
    };
    const { page, alerts } = await openForm(browser, '/landing-2', reply);
    for (const [name, value] of Object.entries({ name: 'Asha', email: 'a@example.com', website: 'acme.com' })) {
      await setField(page, '#audit-form', name, value);
    }
    await submit(page, '#audit-form');
    assert.deepEqual(await errorFields(page, '#audit-form'), ['email']);
    assert.deepEqual(alerts, []);
  } finally {
    await browser.close();
  }
});
