/**
 * Every page reachable from the home page loads with clean URLs, has its
 * header and footer, and every internal link and asset it uses resolves.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { BASE_URL, launch, openPage } = require('./browser');

const FILE_LINK_RE = /\.(pdf|png|jpe?g|webp|svg|mp4|zip)$/i;

test('crawl: all pages load with header, footer and working links', async () => {
  const browser = await launch();
  const seen = new Set();
  const queue = ['/'];
  const problems = [];

  try {
    while (queue.length) {
      const path = queue.shift();
      if (seen.has(path)) continue;
      seen.add(path);

      const failed = [];
      const { page, response } = await openPage(browser, path, undefined, {
        beforeLoad: (p) =>
          p.on('response', (res) => {
            if (res.url().startsWith(BASE_URL) && res.status() >= 400) failed.push(`${res.status()} ${res.url()}`);
          }),
      });

      const info = await page.evaluate(() => ({
        header: Boolean(document.querySelector('.mxd-header, .stripped-header')),
        footer: Boolean(document.querySelector('.mxd-footer, .landing-minimal-footer')),
        links: [...document.querySelectorAll('a[href]')]
          .map((a) => a.getAttribute('href'))
          .filter((href) => href && !href.startsWith('#') && !/^(https?:|mailto:|tel:|javascript:)/.test(href))
          .map((href) => [href, new URL(href, location.href).pathname]),
      }));

      if (response.status() !== 200) problems.push(`${path}: status ${response.status()}`);
      if (!info.header) problems.push(`${path}: header missing`);
      if (!info.footer) problems.push(`${path}: footer missing`);
      failed.forEach((f) => problems.push(`${path}: ${f}`));

      for (const [raw, absolute] of info.links) {
        if (/\.html(#|$)/.test(raw)) problems.push(`${path}: link uses .html: ${raw}`);
        if (FILE_LINK_RE.test(absolute)) continue;
        if (!seen.has(absolute) && !queue.includes(absolute)) queue.push(absolute);
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }

  assert.ok(seen.size >= 30, `expected at least 30 pages, crawled ${seen.size}`);
  assert.deepEqual(problems, []);
});

test('old .html addresses redirect permanently to clean URLs', async () => {
  for (const [from, to] of [
    ['/about-us.html', '/about-us'],
    ['/index.html', '/'],
    ['/insights/funnel-is-dead.html', '/insights/funnel-is-dead'],
  ]) {
    const res = await fetch(BASE_URL + from, { redirect: 'manual' });
    assert.ok([301, 308].includes(res.status), `${from}: status ${res.status}`);
    assert.equal(new URL(res.headers.get('location'), BASE_URL).pathname, to, from);
  }
});

test('unknown addresses get the 404 page', async () => {
  const res = await fetch(`${BASE_URL}/this/page/does-not-exist`);
  assert.equal(res.status, 404);
  assert.match(await res.text(), /Page Not Found \| StellAcu Media/);
});

test('refresh starts at the top (hero), section links still jump to their section', async () => {
  const { openPage: open, sleep } = require('./browser');
  const browser = await launch();
  const problems = [];
  try {
    for (const path of ['/', '/about-us', '/business-advisory', '/insights']) {
      const { page } = await open(browser, path);
      await sleep(1500);
      await page.evaluate(() => window.scrollTo(0, 2500));
      await sleep(800);
      await page.reload({ waitUntil: 'networkidle2' });
      await sleep(2500);
      const y = await page.evaluate(() => Math.round(window.scrollY));
      if (y > 5) problems.push(`${path}: after refresh scrollY is ${y}, want 0`);
      await page.close();
    }

    const { page } = await open(browser, '/solutions#solution-pillars');
    await sleep(1500);
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(2500);
    const y = await page.evaluate(() => Math.round(window.scrollY));
    if (y < 200) problems.push(`/solutions#solution-pillars: after refresh scrollY is ${y}, want the section`);
    await page.close();
  } finally {
    await browser.close();
  }
  assert.deepEqual(problems, []);
});
