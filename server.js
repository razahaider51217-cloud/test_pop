// Minimal static file server with CORRECT MIME types.
// Fixes the Windows issue where Python's http.server reports .js as "text/plain",
// which makes browsers refuse to run <script type="module">.
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const PORT = process.env.PORT || 8000;

// ---------------------------------------------------------------------------
// Bot / crawler blocking
//   BLOCK_BY_IP : block requests whose IP falls inside Google's published
//                 crawler ranges (Googlebot, AdsBot, google-proxy fetchers).
//   BLOCK_BY_UA : also block well-known bot User-Agents as a fallback layer
//                 (for bots that don't crawl from their official IPs).
// ---------------------------------------------------------------------------
const BLOCK_BY_IP = true;
const BLOCK_BY_UA = true;

const RANGE_FILES = [
  'common-crawlers.json',               // Googlebot & common crawlers
  'special-crawlers.json',              // AdsBot & special-case crawlers
  'user-triggered-fetchers.json',       // google-proxy (gae.googleusercontent.com)
  'user-triggered-fetchers-google.json' // google-proxy-*.google.com
];

// --- load Google's IP range files ------------------------------------------
function loadRanges(file) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(root, 'ipranges', file), 'utf8'));
    const out = [];
    if (Array.isArray(raw)) return raw; // plain array of CIDRs
    if (Array.isArray(raw.prefixes)) {  // { prefixes: [{ipv4Prefix|ipv6Prefix}] }
      for (const p of raw.prefixes) {
        if (p.ipv4Prefix) out.push(p.ipv4Prefix);
        if (p.ipv6Prefix) out.push(p.ipv6Prefix);
      }
      return out;
    }
    for (const key of ['ipv4_ranges', 'ipv6_ranges']) { // { ipv4_ranges: [], ipv6_ranges: [] }
      if (Array.isArray(raw[key])) out.push(...raw[key]);
    }
    return out;
  } catch (e) {
    console.warn('ipranges: could not load ' + file + ' (' + e.message + ')');
    return [];
  }
}

// --- 128-bit CIDR matching ---------------------------------------------------
// IPv4 is mapped into its standard ::ffff:0:0/96 position (bits 32..63), so a
// /len IPv4 range becomes a /(len+96) prefix in 128-bit space.
function ipToBigInt(ip) {
  if (ip.startsWith('::ffff:')) ip = ip.slice(7); // strip IPv4-mapped prefix
  if (ip.indexOf('.') !== -1) {                   // plain IPv4 -> bits 32..63
    const p = ip.split('.').map(Number);
    return ((BigInt(p[0]) << 24n) | (BigInt(p[1]) << 16n) | (BigInt(p[2]) << 8n) | BigInt(p[3])) << 32n;
  }
  let parts;
  if (ip.includes('::')) {                        // expand :: shorthand
    const halves = ip.split('::');
    const left = halves[0] ? halves[0].split(':') : [];
    const right = halves[1] ? halves[1].split(':') : [];
    parts = [...left, ...Array(8 - left.length - right.length).fill('0'), ...right];
  } else {
    parts = ip.split(':');
  }
  let v = 0n;
  for (const part of parts) v = (v << 16n) | BigInt(parseInt(part || '0', 16));
  return v;
}

const cidrList = [];
for (const f of RANGE_FILES) {
  for (const cidr of loadRanges(f)) {
    const bits = String(cidr).split('/');
    const len = bits[1] === undefined ? 128 : parseInt(bits[1], 10);
    const isV4 = bits[0].indexOf('.') !== -1;
    try {
      // IPv4 occupies bits 32..63 of the 128-bit value, so a /len v4 range
      // must clear the low (32+len) bits. v6 fills all 128 bits: clear (128-len).
      const mask = isV4 ? ((~0n) << BigInt(32 + len)) : (len <= 0 ? 0n : (~0n) << BigInt(128 - len));
      cidrList.push({ base: ipToBigInt(bits[0]) & mask, mask });
    } catch (e) { /* skip malformed entry */ }
  }
}
console.log('Loaded ' + cidrList.length + ' Google IP ranges for bot blocking');

function ipBlocked(ip) {
  let v;
  try { v = ipToBigInt(ip); } catch (e) { return false; }
  for (const r of cidrList) if ((v & r.mask) === r.base) return true;
  return false;
}

// --- fallback: well-known bot user agents -----------------------------------
const BOT_UA = /googlebot|adsbot|mediapartners-google|bingbot|msnbot|slurp|yandex|baiduspider|petalbot|duckduckbot|facebot|facebookexternalhit|twitterbot|linkedinbot|telegrambot|whatsapp|discordbot|pinterest|slackbot|ahrefsbot|semrushbot|majestic|mj12bot|screaming\ frog|gptbot|chatgpt-user|ccbot|bytespider|amazonbot|applebot|sogou|seznambot|lighthouse|headlesschrome|spider|crawler/i;

// --- client IP (Heroku sends the real IP in X-Forwarded-For) ----------------
function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  let ip = xff ? String(xff).split(',')[0].trim() : (req.socket.remoteAddress || '');
  if (!ip) return null;
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  return ip;
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm':  'text/html; charset=utf-8',
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
  '.mp3':  'audio/mpeg',
  '.wav':  'audio/wav',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf':  'font/ttf',
  '.txt':  'text/plain; charset=utf-8',
};

http.createServer((req, res) => {
  // --- bot gate (before any file is read/sent) ---
  const ip = clientIp(req);
  let blocked = false;
  if (BLOCK_BY_IP && ip && ipBlocked(ip)) blocked = true;
  if (!blocked && BLOCK_BY_UA && BOT_UA.test(req.headers['user-agent'] || '')) blocked = true;
  if (blocked) {
    console.log('[bot-blocked] ' + ip + ' | ' + String(req.headers['user-agent'] || '').slice(0, 80));
    // Stealth: serve a bland empty page with 200 so bots see nothing suspicious
    res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
    return res.end('<!doctype html><html><head><title></title></head><body></body></html>');
  }

  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(root, urlPath);
  if (!filePath.startsWith(root)) { res.writeHead(403); return res.end('403'); }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('404 Not Found'); }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
}).listen(PORT, () => console.log('Serving ' + root + ' at http://localhost:' + PORT + '/'));

module.exports = { ipBlocked, cidrList }; // for tests
