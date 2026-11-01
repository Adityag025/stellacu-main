/**
 * Local development server: `npm run serve`, then open http://localhost:3000
 *
 * Serves the static site with clean URLs and runs the functions in /api
 * the same way Vercel does (/about-us → about-us.html, /api/contact →
 * api/contact.js), so pages and forms can be tested without deploying.
 * Reads settings from .env.local if it exists.
 *
 * This is a convenience for development only; production runs on Vercel.
 */

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

// SITE_ROOT=dist/upload serves the upload bundle instead, to check it is complete.
const ROOT = path.resolve(process.env.SITE_ROOT || path.join(__dirname, '..'));
const PORT = Number(process.env.PORT) || 3000;

const envFile = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.webmanifest': 'application/manifest+json',
};

/** Maps /api/<name> to api/<name>.js; names starting with "_" are private like on Vercel. */
function findApiHandler(pathname) {
  const match = pathname.match(/^\/api\/([a-z0-9-]+)\/?$/);
  if (!match) return null;
  const file = path.join(__dirname, '..', 'api', `${match[1]}.js`);
  return fs.existsSync(file) ? require(file) : null;
}

function isFile(file) {
  return fs.existsSync(file) && fs.statSync(file).isFile();
}

/**
 * Clean URLs, as configured in vercel.json: "/about-us" serves about-us.html,
 * "/" serves index.html. Returns null when nothing matches.
 */
function resolveStaticFile(pathname) {
  const file = path.normalize(path.join(ROOT, decodeURIComponent(pathname)));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return null; // block ../ escapes
  if (isFile(file)) return file;
  if (isFile(`${file}.html`)) return `${file}.html`;
  if (isFile(path.join(file, 'index.html'))) return path.join(file, 'index.html');
  return null;
}

function sendFile(res, status, file) {
  res.writeHead(status, { 'Content-Type': CONTENT_TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://${req.headers.host}`);

  if (pathname.startsWith('/api/')) {
    const handler = findApiHandler(pathname);
    if (handler) return handler(req, res);
  }

  // Like Vercel's cleanUrls: "/about-us.html" → 308 → "/about-us", "/index.html" → "/".
  if (pathname.endsWith('.html')) {
    const clean = pathname.replace(/(?:index)?\.html$/, '') || '/';
    res.writeHead(308, { Location: clean });
    return res.end();
  }

  const file = resolveStaticFile(pathname);
  if (file) return sendFile(res, 200, file);
  sendFile(res, 404, path.join(ROOT, '404.html'));
});

server.listen(PORT, () => {
  console.log(`StellAcu site running at http://localhost:${PORT}`);
  if (!fs.existsSync(envFile)) console.log('No .env.local found: forms will answer "not_configured".');
});
