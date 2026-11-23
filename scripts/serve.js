// Optional: serve the brief at http://localhost:8787 (the site also works by opening index.html directly).
// Local-only (127.0.0.1), read-only, with security headers and no dotfile or path-traversal access.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', 'public'); // run node scripts/build.js first
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.md': 'text/plain', '.png': 'image/png', '.xml': 'application/xml', '.txt': 'text/plain' };
const headers = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action https://buttondown.com; frame-ancestors 'none'; object-src 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Cache-Control': 'no-store',
};

http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, headers); return res.end(); }
  let rel;
  try { rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'; } catch { res.writeHead(400, headers); return res.end(); }
  const file = path.resolve(root, rel);
  const inside = file === root || file.startsWith(root + path.sep);
  const hidden = path.relative(root, file).split(path.sep).some((seg) => seg.startsWith('.'));
  const target = fs.existsSync(file) && fs.statSync(file).isDirectory() ? path.join(file, 'index.html') : file;
  if (!inside || hidden || !types[path.extname(target)]) { res.writeHead(404, headers); return res.end('Not found'); }
  fs.readFile(target, (err, buf) => {
    if (err) { res.writeHead(404, headers); return res.end('Not found'); }
    res.writeHead(200, { ...headers, 'Content-Type': types[path.extname(target)] + (/^(text|application)\//.test(types[path.extname(target)]) ? '; charset=utf-8' : '') });
    res.end(req.method === 'HEAD' ? undefined : buf);
  });
}).listen(process.env.PORT || 8787, '127.0.0.1', () => console.log('The Daily Compound at http://localhost:' + (process.env.PORT || 8787)));
