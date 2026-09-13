// One-time helper: download Google's official crawler IP-range files.
const https = require('https');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'ipranges');
if (!fs.existsSync(dir)) fs.mkdirSync(dir);

const files = [
  'common-crawlers.json',              // Googlebot & friends
  'special-crawlers.json',             // AdsBot & special-case crawlers
  'user-triggered-fetchers.json',      // google-proxy (gae.googleusercontent.com)
  'user-triggered-fetchers-google.json'// google-proxy-*.google.com
];

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(url + ' -> HTTP ' + res.statusCode)); }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    }).on('error', reject);
  });
}

(async () => {
  let failed = false;
  for (const f of files) {
    const url = 'https://developers.google.com/static/crawling/ipranges/' + f;
    try {
      const text = await get(url);
      fs.writeFileSync(path.join(dir, f), text);
      console.log('OK   ' + f + '  (' + text.length + ' bytes)');
    } catch (e) {
      failed = true;
      console.error('FAIL ' + f + '  ' + e.message);
    }
  }
  process.exit(failed ? 1 : 0);
})();
