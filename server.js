const express = require('express');
const path = require('path');
const { customAlphabet } = require('nanoid');

const app = express();
const nano = customAlphabet('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 6);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ==================== DATABASE IN-MEMORY ====================
let links = {};
let stats = {};

// ==================== ROUTE HALAMAN ====================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

app.get('/admin/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

app.get('/stat.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'stat.html'));
});

// ==================== HEADER & USER-AGENT ====================
const UA_LIST = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
];

function getUA() {
  return UA_LIST[Math.floor(Math.random() * UA_LIST.length)];
}

function baseHeaders() {
  return {
    'User-Agent': getUA(),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Upgrade-Insecure-Requests': '1'
  };
}

// ==================== BYPASS ENGINE ====================
const SAFELINK_DOMAINS = [
  'bicolink', 'safelinku', 'sfl.gl', 'shortest', 'linkvertise',
  'move2link', 'tearfull', 'anonymfile', 'gplinks', 'tnlink',
  'mdiskshortner', 'clk.sh', 'fc.lc', 'shortearn', 'adfoc.us',
  'ouo.io', 'shrinkme', 'shrinkearn', 'exe.io', 'dropgalaxy',
  'shorte.st', 'adfly', 'linkshrink', 'bit.ly', 'tinyurl',
  'rebrandly', 'cutt.ly', 'rb.gy', 'is.gd', 'v.gd', 'gg.gg',
  'mboost.me', 'srt.am', 'za.gl', 'cutlink',
  'safelink', 'sub2unlock', 'sub2get', 'sub4unlock', 'yoshort',
  'linkpoi', 'link1s', 'link4rev', 'link5s', 'linkfly',
  'migre.me', 'u.to', 'l.su', 'adf.ly', 'bc.vc'
];

function isSafelink(url) {
  const lower = url.toLowerCase();
  return SAFELINK_DOMAINS.some(d => lower.includes(d));
}

function extractTargetUrl(html, baseUrl) {
  const patterns = [
    /<meta[^>]+http-equiv=["']?refresh["']?[^>]+content=["']?[^;"]+;\s*url=([^"'\s>]+)/i,
    /window\.location(?:\.href)?\s*=\s*["']([^"']+)["']/i,
    /window\.location\.replace\s*\(\s*["']([^"']+)["']/i,
    /location\.href\s*=\s*["']([^"']+)["']/i,
    /location\.replace\s*\(\s*["']([^"']+)["']/i,
    /location\.assign\s*\(\s*["']([^"']+)["']/i,
    /document\.location\s*=\s*["']([^"']+)["']/i,
    /data-url\s*=\s*["']([^"']+)["']/i,
    /data-href\s*=\s*["']([^"']+)["']/i,
    /<form[^>]+action\s*=\s*["']([^"']+)["']/i,
    /["'](?:url|target|redirect|link|destination)["']\s*:\s*["'](https?:\/\/[^"']+)["']/i,
    /var\s+(?:url|link|target|redirect)\s*=\s*["']([^"']+)["']/i,
    /let\s+(?:url|link|target|redirect)\s*=\s*["']([^"']+)["']/i,
    /const\s+(?:url|link|target|redirect)\s*=\s*["']([^"']+)["']/i,
  ];

  for (const p of patterns) {
    const m = html.match(p);
    if (m && m[1]) {
      let target = m[1].trim()
        .replace(/&amp;/g, '&').replace(/&#x2F;/g, '/').replace(/&#47;/g, '/')
        .replace(/&quot;/g, '"').replace(/\\\//g, '/').replace(/\\u002F/g, '/');
      if (/^https?:\/\//.test(target)) {
        if (isSafelink(target) && target !== baseUrl) continue;
        return target;
      }
    }
  }
  return null;
}

async function fetchUrl(url, maxRedirect = 5) {
  let current = url;
  let cookies = '';
  for (let i = 0; i < maxRedirect; i++) {
    const headers = baseHeaders();
    if (cookies) headers['Cookie'] = cookies;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const r = await fetch(current, { headers, redirect: 'manual', signal: controller.signal });
      clearTimeout(timeout);
      const setCookie = r.headers.get('set-cookie');
      if (setCookie) cookies = setCookie.split(',').map(c => c.split(';')[0]).join('; ');
      if (r.status >= 300 && r.status < 400) {
        const loc = r.headers.get('location');
        if (loc) {
          current = loc.startsWith('http') ? loc : new URL(loc, current).href;
          if (!isSafelink(current)) return { finalUrl: current, html: '' };
          continue;
        }
      }
      const html = await r.text();
      return { finalUrl: current, html };
    } catch (e) {
      clearTimeout(timeout);
      if (i === maxRedirect - 1) throw e;
    }
  }
  return { finalUrl: current, html: '' };
}

async function bypassSafelink(inputUrl) {
  const result = { input: inputUrl, success: false, finalUrl: null, steps: [], method: null };
  try {
    const { finalUrl, html } = await fetchUrl(inputUrl);
    result.steps.push({ step: 'fetched', url: finalUrl });
    if (finalUrl !== inputUrl && !isSafelink(finalUrl)) {
      result.success = true; result.finalUrl = finalUrl; result.method = 'http-redirect';
      return result;
    }
    if (html) {
      const extracted = extractTargetUrl(html, finalUrl);
      if (extracted) {
        result.success = true; result.finalUrl = extracted; result.method = 'html-parse';
        return result;
      }
    }
    result.steps.push({ step: 'failed' });
    return result;
  } catch (e) {
    result.steps.push({ step: 'error', msg: e.message });
    return result;
  }
}

// ==================== API: SHORTEN ====================
app.post('/api/shorten', (req, res) => {
  const { url, slug } = req.body;
  if (!url) return res.status(400).json({ error: 'URL wajib diisi' });
  let code = slug && slug.trim() ? slug.trim().replace(/[^a-zA-Z0-9-_]/g, '') : nano();
  if (!code) code = nano();
  if (links[code]) code = nano();
  links[code] = { url, createdAt: Date.now(), clicks: 0 };
  stats[code] = [];
  res.json({ ok: true, code, short: `${req.protocol}://${req.get('host')}/r/${code}`, original: url });
});

// ==================== API: BYPASS ====================
app.post('/api/bypass', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL wajib diisi' });
  const result = await bypassSafelink(url);
  res.json(result);
});

app.get('/bypass', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.send('<h1>URL wajib diisi</h1>');
  const result = await bypassSafelink(url);
  if (result.success) res.redirect(result.finalUrl);
  else res.send(`<pre>${JSON.stringify(result.steps, null, 2)}</pre>`);
});

// ==================== API: INFO ====================
app.get('/api/info/:code', (req, res) => {
  const { code } = req.params;
  if (!links[code]) return res.status(404).json({ error: 'Link tidak ada' });
  res.json({ ok: true, code, ...links[code] });
});

app.get('/api/stats/:code', (req, res) => {
  const { code } = req.params;
  if (!links[code]) return res.status(404).json({ error: 'Link tidak ada' });
  res.json({ ok: true, info: links[code], logs: stats[code] || [] });
});

// ==================== ADMIN ====================
app.get('/api/admin/list', (req, res) => {
  const list = Object.entries(links).map(([code, data]) => ({ code, ...data, short: `/r/${code}` }));
  res.json({ ok: true, total: list.length, list });
});

app.delete('/api/admin/delete/:code', (req, res) => {
  const { code } = req.params;
  if (!links[code]) return res.status(404).json({ error: 'Link tidak ada' });
  delete links[code]; delete stats[code];
  res.json({ ok: true });
});

// ==================== REDIRECT ====================
app.get('/r/:code', (req, res) => {
  const { code } = req.params;
  const link = links[code];
  if (!link) return res.status(404).send('Link tidak ditemukan');
  link.clicks++;
  if (!stats[code]) stats[code] = [];
  stats[code].push({ t: Date.now(), ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress, ua: req.headers['user-agent'] || '' });
  res.sendFile(path.join(__dirname, 'public', 'redirect', 'index.html'));
});

app.get('/api/go/:code', (req, res) => {
  const { code } = req.params;
  if (!links[code]) return res.status(404).json({ error: 'Link tidak ada' });
  res.json({ ok: true, url: links[code].url });
});

// ==================== HEALTH ====================
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), links: Object.keys(links).length });
});

module.exports = app;
