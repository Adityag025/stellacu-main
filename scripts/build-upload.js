/**
 * Collects the files the website needs into dist/upload/, ready to copy to
 * shared hosting (cPanel File Manager or FTP, into public_html):
 *
 *   npm run build:upload
 *
 * Leaves out developer files (tests, docs, scripts, node_modules), the
 * unused template pages and source files, and the Node.js api/ folder
 * (Vercel only). The PHP form API (php-api/) is included, except
 * php-api/config.local.php: it holds the mailbox password and is uploaded
 * once, separately.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'dist', 'upload');

const PAGES = [
  '404.html',
  'index.html',
  'about-us.html',
  'solutions.html',
  'business-advisory.html',
  'inbound.html',
  'outbound.html',
  'media-growth.html',
  'ai-automation.html',
  'carbon-smart.html',
  'insights.html',
  'start-a-growth-audit.html',
  'faq.html',
  'privacy-policy.html',
  'terms-and-conditions.html',
  'landing-1.html',
  'landing-2.html',
];

const FOLDERS = ['insights', 'partials', 'css', 'js', 'fonts', 'img', 'video', 'php-api'];

const EXTRA_FILES = ['.htaccess'];

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

for (const file of [...PAGES, ...EXTRA_FILES]) {
  fs.copyFileSync(path.join(ROOT, file), path.join(OUT, file));
}
for (const folder of FOLDERS) {
  fs.cpSync(path.join(ROOT, folder), path.join(OUT, folder), { recursive: true });
}
fs.rmSync(path.join(OUT, 'php-api', 'config.local.php'), { force: true });

// Every page must be in the list above, so a new page is never left out.
const missing = fs
  .readdirSync(ROOT)
  .filter((f) => f.endsWith('.html') && fs.readFileSync(path.join(ROOT, f), 'utf8').includes('custom.css?v='))
  .filter((f) => !PAGES.includes(f) && f !== 'services.html');
if (missing.length) {
  console.warn(`Warning: these site pages are not in PAGES and were not copied: ${missing.join(', ')}`);
}

let files = 0;
let bytes = 0;
(function count(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) count(full);
    else {
      files++;
      bytes += fs.statSync(full).size;
    }
  }
})(OUT);

console.log(`dist/upload: ${files} files, ${(bytes / 1024 / 1024).toFixed(1)} MB`);
