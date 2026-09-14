/* ==========================================================================
   SARAB - static site server
   --------------------------------------------------------------------------
   Zero dependencies. Heroku's Node buildpack runs this as the web process
   (see Procfile: "web: node server.js") and it serves the static site that
   lives next to this file.

     node server.js            -> http://localhost:3000
     PORT / HOST env vars are respected (Heroku sets PORT automatically)

   Features: pretty URLs (/locations -> locations.html), correct MIME types
   (including .svg, .woff2 and extension-less files), gzip compression,
   ETag / Last-Modified with 304 responses, sensible cache headers, a custom
   404.html, path-traversal protection and a couple of safe security headers.
   ========================================================================== */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = __dirname;
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const NOT_FOUND_PAGE = path.join(ROOT, '404.html');

const MIME = {
   '.html': 'text/html; charset=utf-8',
   '.htm': 'text/html; charset=utf-8',
   '.css': 'text/css; charset=utf-8',
   '.js': 'application/javascript; charset=utf-8',
   '.mjs': 'application/javascript; charset=utf-8',
   '.json': 'application/json; charset=utf-8',
   '.webmanifest': 'application/manifest+json; charset=utf-8',
   '.xml': 'application/xml; charset=utf-8',
   '.txt': 'text/plain; charset=utf-8',
   '.md': 'text/markdown; charset=utf-8',
   '.svg': 'image/svg+xml',
   '.png': 'image/png',
   '.jpg': 'image/jpeg',
   '.jpeg': 'image/jpeg',
   '.gif': 'image/gif',
   '.webp': 'image/webp',
   '.avif': 'image/avif',
   '.ico': 'image/x-icon',
   '.woff': 'font/woff',
   '.woff2': 'font/woff2',
   '.ttf': 'font/ttf',
   '.otf': 'font/otf',
   '.eot': 'application/vnd.ms-fontobject',
   '.map': 'application/json; charset=utf-8',
   '.mp4': 'video/mp4',
   '.webm': 'video/webm',
   '.mp3': 'audio/mpeg',
   '.pdf': 'application/pdf'
};

const COMPRESSIBLE = /^(text\/|application\/(javascript|json|xml|manifest\+json)|image\/svg\+xml)/;
const TEXT_TYPES = /^text\/html/;

/* files we never want to expose even though they sit in the folder */
const BLOCKED = ['/.git', '/node_modules'];

function contentType(file) {
   const ext = path.extname(file).toLowerCase();
   if (MIME[ext]) return MIME[ext];
   /* extension-less files (.nojekyll, Procfile, ...) are plain text */
   if (ext === '') return 'text/plain; charset=utf-8';
   return 'application/octet-stream';
}

/* turn a request path into a safe absolute file path (or null) */
function safePath(urlPath) {
   let rel = urlPath;
   try {
      rel = decodeURIComponent(urlPath);
   } catch (e) {
      return null;
   }
   rel = rel.split('?')[0].split('#')[0].replace(/\\/g, '/');
   if (rel.indexOf('\0') !== -1) return null;

   const abs = path.normalize(path.join(ROOT, rel));
   if (abs !== ROOT && abs.indexOf(ROOT + path.sep) !== 0) return null;   /* traversal */
   for (let i = 0; i < BLOCKED.length; i++) {
      if (abs.indexOf(path.join(ROOT, BLOCKED[i])) === 0) return null;
   }
   return abs;
}

function exists(file) {
   try {
      return !!file && fs.statSync(file).isFile();
   } catch (e) {
      return false;
   }
}

function cacheHeader(file) {
   const ext = path.extname(file).toLowerCase();
   if (ext === '.html' || ext === '.htm') return 'public, max-age=0, must-revalidate';
   if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.ico', '.svg'].indexOf(ext) !== -1) {
      return 'public, max-age=2592000';            /* 30 days for images */
   }
   if (['.woff', '.woff2', '.ttf', '.otf', '.eot'].indexOf(ext) !== -1) {
      return 'public, max-age=2592000';            /* 30 days for fonts */
   }
   if (['.css', '.js'].indexOf(ext) !== -1) return 'public, max-age=604800';   /* 7 days */
   return 'public, max-age=3600';
}

function baseHeaders() {
   return {
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'SAMEORIGIN'
   };
}
/* ---------- responses ---------- */
function send(res, status, headers, body) {
   res.writeHead(status, headers);
   res.end(body);
}

function sendNotFound(res, headOnly) {
   const headers = Object.assign(baseHeaders(), {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate'
   });
   let body = '<!doctype html><meta charset="utf-8"><title>404 - page not found</title>' +
      '<h1>404</h1><p>Sorry, that page is not on the menu. <a href="/">Back to Sarab</a></p>';
   try {
      if (fs.existsSync(NOT_FOUND_PAGE)) body = fs.readFileSync(NOT_FOUND_PAGE);
   } catch (e) { /* fall back to the tiny page above */ }
   headers['Content-Length'] = Buffer.byteLength(body);
   res.writeHead(404, headers);
   res.end(headOnly ? undefined : body);
}

function serveFile(req, res, file, headOnly) {
   let stat;
   try {
      stat = fs.statSync(file);
   } catch (e) {
      return sendNotFound(res, headOnly);
   }

   const etag = '"' + stat.size.toString(16) + '-' + Math.round(stat.mtimeMs).toString(16) + '"';
   const lastModified = stat.mtime.toUTCString();
   const headers = Object.assign(baseHeaders(), {
      'Content-Type': contentType(file),
      'Cache-Control': cacheHeader(file),
      'ETag': etag,
      'Last-Modified': lastModified,
      'Vary': 'Accept-Encoding'
   });

   /* conditional requests */
   const inm = req.headers['if-none-match'];
   const ims = req.headers['if-modified-since'];
   if ((inm && inm === etag) || (!inm && ims && new Date(ims).getTime() >= Math.floor(stat.mtimeMs / 1000) * 1000)) {
      res.writeHead(304, headers);
      return res.end();
   }

   const type = headers['Content-Type'];
   const acceptsGzip = /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''));
   const shouldZip = acceptsGzip && COMPRESSIBLE.test(type) && stat.size > 900;

   if (shouldZip) {
      headers['Content-Encoding'] = 'gzip';
      res.writeHead(200, headers);
      if (headOnly) return res.end();
      return fs.createReadStream(file).pipe(zlib.createGzip({ level: 6 })).pipe(res);
   }

   headers['Content-Length'] = stat.size;
   res.writeHead(200, headers);
   if (headOnly) return res.end();
   fs.createReadStream(file).on('error', function () {
      res.destroy();
   }).pipe(res);
}

/* ---------- request handler ---------- */
function handler(req, res) {
   if (req.method !== 'GET' && req.method !== 'HEAD') {
      return send(res, 405, Object.assign(baseHeaders(), {
         'Allow': 'GET, HEAD',
         'Content-Type': 'text/plain; charset=utf-8'
      }), 'Method not allowed');
   }

   const headOnly = req.method === 'HEAD';
   const raw = req.url || '/';
   if (raw === '/healthz' || raw === '/health') {
      return send(res, 200, Object.assign(baseHeaders(), {
         'Content-Type': 'application/json; charset=utf-8',
         'Cache-Control': 'no-store'
      }), JSON.stringify({ status: 'ok', service: 'sarab-site', uptime: Math.round(process.uptime()) }));
   }

   let pathname = raw.split('?')[0].split('#')[0];
   if (pathname === '') pathname = '/';

   /* candidate files: exact path, then pretty URL variants */
   const candidates = [];
   if (pathname === '/') {
      candidates.push('/index.html');
   } else {
      candidates.push(pathname);
      if (pathname.charAt(pathname.length - 1) === '/') {
         candidates.push(pathname + 'index.html');
      } else if (!path.extname(pathname)) {
         candidates.push(pathname + '.html');
         candidates.push(pathname + '/index.html');
      }
   }

   for (let i = 0; i < candidates.length; i++) {
      const file = safePath(candidates[i]);
      if (exists(file)) return serveFile(req, res, file, headOnly);
   }

   /* a directory without index.html, or a missing file */
   return sendNotFound(res, headOnly);
}

/* ---------- start ---------- */
const server = http.createServer(function (req, res) {
   try {
      handler(req, res);
   } catch (err) {
      console.error('Request failed:', req.method, req.url, err && err.message);
      if (!res.headersSent) {
         send(res, 500, Object.assign(baseHeaders(), {
            'Content-Type': 'text/plain; charset=utf-8'
         }), 'Internal server error');
      } else {
         res.destroy();
      }
   }
});

if (require.main === module) {
   server.listen(PORT, HOST, function () {
      console.log('Listening on http://' + HOST + ':' + PORT +
         ' (PORT env ' + (process.env.PORT ? 'set to ' + process.env.PORT : 'not set, defaulted to 3000') + ')');
      console.log('Sarab site serving static files from ' + ROOT);
   });
}

module.exports = { server: server, handler: handler, MIME: MIME, ROOT: ROOT };
