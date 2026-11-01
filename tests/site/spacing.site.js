/**
 * Section spacing follows the one rule in css/custom.css ("Section spacing"):
 * every section after the first starts flush (no top padding) and ends with
 * --section-gap of bottom padding, except banded sections and the section
 * just before one, which use half the gap. The full-screen home hero and the
 * pre-footer section keep the template spacing.
 *
 * Also checks the visible space between the content of neighbouring sections
 * stays within a sensible range, so a stray margin or fixed height inside a
 * section cannot reintroduce a large gap.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { DESKTOP, MOBILE, MAIN_PAGES, launch, openPage } = require('./browser');

// --section-gap values from css/custom.css, by viewport width.
const SECTION_GAP = { [DESKTOP]: 130, [MOBILE]: 90 };
// Largest allowed space between two sections' visible content.
const MAX_VISIBLE_GAP = { [DESKTOP]: 240, [MOBILE]: 170 };

const PAGES = MAIN_PAGES.filter((p) => !['/faq', '/privacy-policy', '/terms-and-conditions'].includes(p));

function readSections(page) {
  return page.evaluate(() => {
    const CONTENT = 'h1,h2,h3,h4,p,a.btn,img,video,li,input,textarea,button,.mxd-promo__inner,.marquee__item,[class*="__card"],[class*="-card"],.mxd-blog-preview__item';
    const sections = [...document.querySelectorAll('main > .mxd-section')].filter((s) => s.offsetHeight > 0);
    return sections.map((s, i) => {
      const style = getComputedStyle(s);
      let top = Infinity;
      let bottom = -Infinity;
      s.querySelectorAll(CONTENT).forEach((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (r.height < 2 || r.width < 2 || cs.visibility === 'hidden' || cs.position === 'fixed') return;
        top = Math.min(top, r.top + window.scrollY);
        bottom = Math.max(bottom, r.bottom + window.scrollY);
      });
      return {
        name: `#${i + 1} .${[...s.classList].join('.')}`,
        first: i === 0,
        last: i === sections.length - 1,
        band: s.classList.contains('section-band'),
        hero: s.classList.contains('section-hero'),
        beforeBand: Boolean(sections[i + 1] && sections[i + 1].classList.contains('section-band')),
        hasMarquee: Boolean(s.querySelector('.marquee')),
        paddingTop: Math.round(parseFloat(style.paddingTop)),
        paddingBottom: Math.round(parseFloat(style.paddingBottom)),
        top,
        bottom,
      };
    });
  });
}

for (const width of [DESKTOP, MOBILE]) {
  test(`spacing: section padding follows the shared rule at ${width}px`, async () => {
    const gap = SECTION_GAP[width];
    const browser = await launch();
    const problems = [];
    try {
      for (const path of PAGES) {
        const { page } = await openPage(browser, path, width, { settle: true });
        for (const s of await readSections(page)) {
          const half = Math.round(gap * 0.5);
          if (!s.first) {
            const wantTop = s.band ? half : 0;
            if (s.paddingTop !== wantTop) problems.push(`${path} ${s.name}: padding-top ${s.paddingTop}, want ${wantTop}`);
          }
          if (!s.last && !s.hero) {
            const wantBottom = s.band || s.beforeBand ? half : gap;
            if (s.paddingBottom !== wantBottom) problems.push(`${path} ${s.name}: padding-bottom ${s.paddingBottom}, want ${wantBottom}`);
          }
        }
        await page.close();
      }
    } finally {
      await browser.close();
    }
    assert.deepEqual(problems, []);
  });

  test(`spacing: no oversized gaps between sections at ${width}px`, async () => {
    const browser = await launch();
    const problems = [];
    try {
      for (const path of PAGES) {
        const { page } = await openPage(browser, path, width, { settle: true });
        const sections = await readSections(page);
        for (let i = 1; i < sections.length; i++) {
          const a = sections[i - 1];
          const b = sections[i];
          // Scrolling text banners have no measurable box; skip pairs that involve one.
          if (a.hasMarquee || b.hasMarquee || !isFinite(a.bottom) || !isFinite(b.top)) continue;
          const visible = Math.round(b.top - a.bottom);
          if (visible > MAX_VISIBLE_GAP[width]) problems.push(`${path}: ${visible}px between ${a.name} and ${b.name}`);
        }
        await page.close();
      }
    } finally {
      await browser.close();
    }
    assert.deepEqual(problems, []);
  });
}

test('service pages: Architecture Notes title, description and button are evenly spaced', async () => {
  const { SERVICE_PAGES } = require('./browser');
  const browser = await launch();
  const problems = [];
  try {
    for (const width of [1280, DESKTOP, 1920]) {
      for (const path of SERVICE_PAGES) {
        const { page } = await openPage(browser, path, width);
        const row = await page.evaluate(() => {
          const section = document.querySelector('.architecture-notes-section');
          const title = section.querySelector('h2');
          const descr = section.querySelector('.mxd-section-title__hrdescr p');
          const button = section.querySelector('.mxd-section-title__hrcontrols a');
          // Visible text extents (ignores the boxes' empty space).
          const textBox = (el) => {
            const range = document.createRange();
            range.selectNodeContents(el);
            const rects = [...range.getClientRects()];
            return { left: Math.min(...rects.map((r) => r.left)), right: Math.max(...rects.map((r) => r.right)) };
          };
          const t = textBox(title);
          const d = textBox(descr);
          const lineHeight = parseFloat(getComputedStyle(title).lineHeight);
          return {
            before: Math.round(d.left - t.right),
            after: Math.round(button.getBoundingClientRect().left - d.right),
            titleLines: Math.round(title.getBoundingClientRect().height / lineHeight),
          };
        });
        if (Math.abs(row.before - row.after) > 3) problems.push(`${path} @${width}: gaps ${row.before}px vs ${row.after}px`);
        if (row.titleLines !== 1) problems.push(`${path} @${width}: title wraps to ${row.titleLines} lines`);
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
  assert.deepEqual(problems, []);
});
