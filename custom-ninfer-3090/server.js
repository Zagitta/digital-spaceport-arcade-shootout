#!/usr/bin/env node
/*
 * DIGITAL SPACEPORT ARCADE — zero-dependency static file server.
 * Serves this directory on 0.0.0.0:8888 (override with PORT / HOST env vars).
 * Node built-in http only — no npm packages, no build step.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const HOST = process.env.HOST || '0.0.0.0';
const PORT = parseInt(process.env.PORT || '8888', 10);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.otf':  'font/otf',
  '.mp3':  'audio/mpeg',
  '.ogg':  'audio/ogg',
  '.wav':  'audio/wav',
  '.txt':  'text/plain; charset=utf-8',
  '.md':   'text/markdown; charset=utf-8',
};

function send(res, code, body, headers) {
  res.writeHead(code, Object.assign({
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  }, headers));
  res.end(body);
}

function serveFile(req, res, filePath) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      // try .html extension for clean URLs (/lander -> /lander.html)
      const alt = filePath + '.html';
      return fs.stat(alt, (e2, s2) => {
        if (!e2 && s2.isFile()) streamFile(res, alt);
        else notFound(res);
      });
    }
    streamFile(res, filePath);
  });
}

function streamFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  });
  const rs = fs.createReadStream(filePath);
  rs.on('error', () => notFound(res));
  rs.pipe(res);
}

function notFound(res) {
  send(res, 404, '<!doctype html><meta charset="utf-8"><title>404</title>' +
    '<body style="background:#05010f;color:#ff2bd6;font-family:monospace;display:flex;' +
    'align-items:center;justify-content:center;height:100vh;margin:0">' +
    '<div style="text-align:center"><h1 style="font-size:64px">404</h1>' +
    '<p>SIGNAL LOST — RETURN TO THE <a href="/" style="color:#21e6ff">SPACEPORT</a></p></div>');
}

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (e) {
    return notFound(res);
  }
  if (urlPath === '/') urlPath = '/index.html';

  // Resolve safely inside ROOT (block traversal)
  const resolved = path.normalize(path.join(ROOT, urlPath));
  if (!resolved.startsWith(ROOT)) {
    return notFound(res);
  }
  serveFile(req, res, resolved);
});

server.listen(PORT, HOST, () => {
  console.log(`[DSP SPACEPORT] Digital Spaceport Arcade online`);
  console.log(`[DSP SPACEPORT] serving ${ROOT}`);
  console.log(`[DSP SPACEPORT] http://${HOST}:${PORT}/  (landing)`);
  console.log(`[DSP SPACEPORT] games: /lander  /invaders  /runner`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[DSP SPACEPORT] port ${PORT} is already in use.`);
    process.exit(1);
  }
  throw err;
});
