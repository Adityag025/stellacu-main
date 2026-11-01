/**
 * Shared setup for the browser tests in tests/site.
 *
 * They drive the Chrome already installed on this computer (no browser
 * download) against a running copy of the site:
 *
 *   npm run serve            # in one terminal, http://localhost:3000
 *   npm run test:site        # in another
 *
 * Settings (environment variables):
 *   BASE_URL     site to test, default http://localhost:3000
 *                (e.g. BASE_URL=https://stellacu-main.vercel.app to check production)
 *   CHROME_PATH  Chrome/Chromium executable, if not in the usual place
 */

const fs = require('node:fs');
const puppeteer = require('puppeteer-core');

const BASE_URL = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

const DESKTOP = 1440;
const MOBILE = 390;

/** Pages every test covers: everything reachable from the menu and footer. */
const MAIN_PAGES = [
  '/',
  '/about-us',
  '/solutions',
  '/business-advisory',
  '/inbound',
  '/outbound',
  '/media-growth',
  '/ai-automation',
  '/carbon-smart',
  '/insights',
  '/start-a-growth-audit',
  '/faq',
  '/privacy-policy',
  '/terms-and-conditions',
];

const SERVICE_PAGES = ['/business-advisory', '/inbound', '/outbound', '/media-growth', '/ai-automation', '/carbon-smart'];

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

function findChrome() {
  const found = CHROME_CANDIDATES.find((file) => fs.existsSync(file));
  if (!found) throw new Error('Chrome not found. Set CHROME_PATH to your Chrome or Chromium executable.');
  return found;
}

function launch() {
  return puppeteer.launch({ executablePath: findChrome() });
}

/**
 * Opens a page at the given width.
 * @param {object} [options]
 * @param {boolean} [options.settle]  Scroll through the page and turn off animations so
 *                                    every section is laid out in its final position.
 * @param {(page) => Promise<void>|void} [options.beforeLoad]  Runs before navigation,
 *                                    e.g. to attach request/response listeners.
 */
async function openPage(browser, path, width = DESKTOP, { settle = false, beforeLoad } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width, height: 900 });
  if (beforeLoad) await beforeLoad(page);
  const response = await page.goto(BASE_URL + path, { waitUntil: 'networkidle2', timeout: 90000 });
  await page.evaluate(() => document.fonts.ready);

  if (settle) {
    await page.addStyleTag({ content: '*{transition:none!important;animation:none!important}' });
    const height = await page.evaluate(() => document.body.scrollHeight);
    for (let y = 0; y < height; y += 600) {
      await page.evaluate((top) => window.scrollTo(0, top), y);
      await sleep(50);
    }
    await sleep(800);
  }
  return { page, response };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { BASE_URL, DESKTOP, MOBILE, MAIN_PAGES, SERVICE_PAGES, launch, openPage, sleep };
