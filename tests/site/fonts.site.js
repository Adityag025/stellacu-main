/**
 * All visible text is set in Poppins (icons excepted), at desktop and phone widths,
 * and every weight in use is actually loaded (no browser-faked bold).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { DESKTOP, MOBILE, MAIN_PAGES, launch, openPage } = require('./browser');

const PAGES = [...MAIN_PAGES, '/landing-1', '/landing-2', '/insights/funnel-is-dead'];

async function textFonts(page) {
  return page.evaluate(() => {
    const loaded = new Set(
      [...document.fonts].filter((f) => f.status === 'loaded' && f.family.includes('Poppins')).map((f) => `${f.style} ${f.weight}`)
    );
    const problems = [];
    for (const el of document.querySelectorAll('body *')) {
      if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) continue;
      const ownText = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
      if (!ownText && !['INPUT', 'TEXTAREA', 'BUTTON'].includes(el.tagName)) continue;
      const style = getComputedStyle(el);
      if (style.display === 'none' || el.getClientRects().length === 0) continue;
      const family = style.fontFamily.split(',')[0].replace(/["']/g, '').trim();
      if (family.startsWith('Phosphor')) continue; // icon font
      const label = `<${el.tagName.toLowerCase()} class="${el.className}"> "${ownText.slice(0, 30)}"`;
      if (family !== 'Poppins') problems.push(`${family}: ${label}`);
      else if (!loaded.has(`${style.fontStyle === 'italic' ? 'italic' : 'normal'} ${style.fontWeight}`)) {
        problems.push(`weight ${style.fontWeight} not loaded: ${label}`);
      }
    }
    return problems;
  });
}

for (const width of [DESKTOP, MOBILE]) {
  test(`fonts: Poppins everywhere at ${width}px`, async () => {
    const browser = await launch();
    const problems = [];
    try {
      for (const path of PAGES) {
        const { page } = await openPage(browser, path, width);
        (await textFonts(page)).forEach((p) => problems.push(`${path}: ${p}`));
        await page.close();
      }
    } finally {
      await browser.close();
    }
    assert.deepEqual([...new Set(problems)], []);
  });
}

test('fonts: every heading uses weight 500', async () => {
  const browser = await launch();
  const problems = [];
  try {
    for (const path of PAGES) {
      const { page } = await openPage(browser, path);
      const heavy = await page.evaluate(() =>
        [...document.querySelectorAll('main :is(h1, h2, h3, h4, h5, h6)')]
          .filter((h) => h.getClientRects().length && getComputedStyle(h).fontWeight !== '500')
          .map((h) => `${h.tagName} ${getComputedStyle(h).fontWeight} "${h.textContent.trim().slice(0, 30)}"`)
      );
      heavy.forEach((h) => problems.push(`${path}: ${h}`));
      await page.close();
    }
  } finally {
    await browser.close();
  }
  assert.deepEqual(problems, []);
});

test('fonts: paragraphs use 400 (title-like ones 500) and buttons use 500', async () => {
  const browser = await launch();
  const problems = [];
  try {
    for (const path of PAGES) {
      const { page } = await openPage(browser, path);
      const found = await page.evaluate(() => {
        const out = [];
        const visible = (el) => el.getClientRects().length && el.textContent.trim();
        const titleLike = '.mxd-block__manifest p, .mxd-services-list__title p, .custom-premium-stat-card__number';
        for (const p of document.querySelectorAll('main p')) {
          if (!visible(p)) continue;
          const want = p.matches(titleLike) ? '500' : '400';
          const got = getComputedStyle(p).fontWeight;
          if (got !== want) out.push(`p ${got} (want ${want}) "${p.textContent.trim().slice(0, 30)}"`);
        }
        for (const btn of document.querySelectorAll('.btn')) {
          if (!btn.getClientRects().length) continue;
          const label = btn.querySelector('.btn-caption') || btn;
          const got = getComputedStyle(label).fontWeight;
          if (got !== '500') out.push(`button ${got} "${btn.textContent.trim().replace(/s+/g, ' ').slice(0, 30)}"`);
        }
        return out;
      });
      found.forEach((f) => problems.push(`${path}: ${f}`));
      await page.close();
    }
  } finally {
    await browser.close();
  }
  assert.deepEqual(problems, []);
});
