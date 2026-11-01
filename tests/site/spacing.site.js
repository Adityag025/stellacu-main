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
