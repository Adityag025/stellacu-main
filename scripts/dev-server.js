/**
 * Local development server: `npm run serve`, then open http://localhost:3000
 *
 * Serves the static site and runs the functions in /api the same way
 * Vercel does (/api/contact → api/contact.js), so forms can be tested
 * without deploying. Reads settings from .env.local if it exists.
 *
 * This is a convenience for development only; production runs on Vercel.
 */

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 3000;

const envFile = path.join(ROOT, '.env.local');
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
  const file = path.join(ROOT, 'api', `${match[1]}.js`);
  return fs.existsSync(file) ? require(file) : null;
}

function resolveStaticFile(pathname) {
  const file = path.normalize(path.join(ROOT, decodeURIComponent(pathname)));
  if (!file.startsWith(ROOT + path.sep)) return null; // block ../ escapes
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) return path.join(file, 'index.html');
  return file;
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

  const file = resolveStaticFile(pathname);
  if (file && fs.existsSync(file)) return sendFile(res, 200, file);
  sendFile(res, 404, path.join(ROOT, '404.html'));
});

server.listen(PORT, () => {
  console.log(`StellAcu site running at http://localhost:${PORT}`);
  if (!fs.existsSync(envFile)) console.log('No .env.local found: forms will answer "not_configured".');
});
