const express = require('express');
const path = require('path');
const { customAlphabet } = require('nanoid');
const { kv } = require('@vercel/kv');

const app = express();
const nano = customAlphabet('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 6);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ==================== DATABASE (Vercel KV) ====================
async function getLinks() {
  try {
    return await kv.get('links') || {};
  } catch (e) {
    return {};
  }
}

async function setLinks(links) {
  try {
    await kv.set('links', links);
  } catch (e) {}
}

async function getStats(code) {
  try {
    return await kv.get(`stats:${code}`) || [];
  } catch (e) {
    return [];
  }
}

async function addStat(code, entry) {
  try {
    const stats = await getStats(code);
    stats.push(entry);
    if (stats.length > 500) stats.shift();
    await kv.set(`stats:${code}`, stats);
  } catch (e) {}
}

async function deleteLink(code) {
  const links = await getLinks();
  delete links[code];
  await setLinks(links);
  try {
    await kv.del(`stats:${code}`);
  } catch (e) {}
}

// ==================== HEADER & USER-AGENT ====================
const UA_LIST = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
];
function getUA() { return UA_LIST[Math.floor(Math.random() * UA_LIST.length)]; }

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
    /<meta[^>]+content=["']?[^;"]+;\s*url=([^"'\s>]+)["']?[^>]+http-equiv=["']?refresh/i,
    /window\.location(?:\.href)?\s*=\s*["']([^"']+)["']/i,
    /window\.location\.replace\s*\(\s*["']([^"']+)["']/i,
    /location\.href\s*=\s*["']([^"']+)["']/i,
    /location\.replace\s*\(\s*["']([^"']+)["']/i,
    /location\.assign\s*\(\s*["']([^"']+)["']/i,
    /document\.location\s*=\s*["']([^"']+)["']/i,
    /top\.location\s*=\s*["']([^"']+)["']/i,
    /self\.location\s*=\s*["']([^"']+)["']/i,
    /window\.open\s*\(\s*["']([^"']+)["']/i,
    /setTimeout\s*\(\s*function\s*\(\s*\)\s*\{\s*(?:window\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']/i,
    /setTimeout\s*\(\s*["'](?:window\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']/i,
    /data-url\s*=\s*["']([^"']+)["']/i,
    /data-href\s*=\s*["']([^"']+)["']/i,
    /data-target\s*=\s*["']([^"']+)["']/i,
    /data-redirect\s*=\s*["']([^"']+)["']/i,
    /<a[^>]+href\s*=\s*["']([^"']+)["'][^>]*>(?:\s*<[^>]+>)*\s*(?:lanjut|continue|go|klik|next|get\s*link|download)/i,
    /<form[^>]+action\s*=\s*["']([^"']+)["']/i,
    /["'](?:url|target|redirect|link|destination)["']\s*:\s*["'](https?:\/\/[^"']+)["']/i,
    /\\"url\\"\s*:\s*\\"(https?:\/\/[^"\\]+)\\"/i,
    /atob\s*\(\s*["']([A-Za-z0-9+/=]+)["']\s*\)/i,
    /var\s+(?:url|link|target|redirect|destination)\s*=\s*["']([^"']+)["']/i,
    /let\s+(?:url|link|target|redirect|destination)\s*=\s*["']([^"']+)["']/i,
    /const\s+(?:url|link|target|redirect|destination)\s*=\s*["']([^"']+)["']/i,
    /url\s*[:=]\s*["'](https?:\/\/[^"']+)["']/i,
    /href\s*[:=]\s*["'](https?:\/\/[^"']+)["']/i,
  ];

  for (const p of patterns) {
    const m = html.match(p);
    if (m && m[1]) {
      let target = m[1].trim();
      target = target.replace(/&amp;/g, '&')
                     .replace(/&#x2F;/g, '/')
                     .replace(/&#47;/g, '/')
                     .replace(/&quot;/g, '"')
                     .replace(/\\\//g, '/')
                     .replace(/\\u002F/g, '/')
                     .replace(/\\u003A/g, ':');

      if (/^[A-Za-z0-9+/=]{20,}$/.test(target)) {
        try {
          const dec = Buffer.from(target, 'base64').toString('utf8');
          if (/^https?:\/\//.test(dec)) target = dec;
        } catch (e) {}
      }

      if (/^https?:\/\//.test(target)) {
        if (isSafelink(target) && target !== baseUrl) continue;
        return target;
      }

      if (target.startsWith('/')) {
        try {
          const u = new URL(baseUrl);
          return u.origin + target;
        } catch (e) {}
      }
    }
  }
  return null;
}

function extractFromParams(html) {
  const patterns = [
    /[?&](?:url|u|target|link|redirect|to|dest|destination|r)=([^"'&\s<>]+)/i,
    /name=["'](?:url|target|link|redirect)["'][^>]+value=["']([^"']+)["']/i,
    /value=["']([^"']+)["'][^>]+name=["'](?:url|target|link|redirect)["']/i,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m && m[1]) {
      try {
        const dec = decodeURIComponent(m[1]);
        if (/^https?:\/\//.test(dec)) return dec;
      } catch (e) {}
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
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const r = await fetch(current, {
        headers,
        redirect: 'manual',
        signal: controller.signal
      });
      clearTimeout(timeout);

      const setCookie = r.headers.get('set-cookie');
      if (setCookie) {
        cookies = setCookie.split(',').map(c => c.split(';')[0]).join('; ');
      }

      if (r.status >= 300 && r.status < 400) {
        const loc = r.headers.get('location');
        if (loc) {
          current = loc.startsWith('http') ? loc : new URL(loc, current).href;
          if (!isSafelink(current)) {
            return { finalUrl: current, html: '', chain: current };
          }
          continue;
        }
      }

      const html = await r.text();
      return { finalUrl: current, html, chain: current };
    } catch (e) {
      clearTimeout(timeout);
      if (i === maxRedirect - 1) throw e;
    }
  }
  return { finalUrl: current, html: '', chain: current };
}

async function bypassSafelink(inputUrl) {
  const result = {
    input: inputUrl,
    success: false,
    finalUrl: null,
    steps: [],
    method: null
  };

  try {
    result.steps.push({ step: 'start', url: inputUrl });

    const { finalUrl, html } = await fetchUrl(inputUrl);
    result.steps.push({ step: 'fetched', url: finalUrl, htmlLength: html.length });

    if (finalUrl !== inputUrl && !isSafelink(finalUrl)) {
      result.success = true;
      result.finalUrl = finalUrl;
      result.method = 'http-redirect';
      return result;
    }

    if (html && html.length > 0) {
      const extracted = extractTargetUrl(html, finalUrl);
      if (extracted) {
        result.steps.push({ step: 'extracted-from-html', url: extracted });
        result.finalUrl = extracted;
        result.success = true;
        result.method = 'html-parse';
        return result;
      }

      const fromParams = extractFromParams(html);
      if (fromParams) {
        result.steps.push({ step: 'extracted-from-params', url: fromParams });
        result.finalUrl = fromParams;
        result.success = true;
        result.method = 'params-parse';
        return result;
      }

      const inner = extractTargetUrl(html, finalUrl);
      if (inner && isSafelink(inner) && inner !== inputUrl) {
        result.steps.push({ step: 'recursive', url: inner });
        const sub = await bypassSafelink(inner);
        if (sub.success) {
          result.success = true;
          result.finalUrl = sub.finalUrl;
          result.method = 'recursive-' + sub.method;
          result.steps.push(...sub.steps);
          return result;
        }
      }
    }

    result.steps.push({ step: 'failed', reason: 'no pattern matched' });
    return result;
  } catch (e) {
    result.steps.push({ step: 'error', msg: e.message });
    return result;
  }
}

// ==================== API: SHORTEN ====================
app.post('/api/shorten', async (req, res) => {
  const { url, slug } = req.body;
  if (!url) return res.status(400).json({ error: 'URL wajib diisi' });

  const links = await getLinks();
  let code = slug && slug.trim() ? slug.trim().replace(/[^a-zA-Z0-9-_]/g, '') : nano();
  if (!code) code = nano();
  if (links[code]) code = nano();

  links[code] = {
    url,
    createdAt: Date.now(),
    clicks: 0
  };
  await setLinks(links);
  await kv.set(`stats:${code}`, []);

  res.json({
    ok: true,
    code,
    short: `${req.protocol}://${req.get('host')}/r/${code}`,
    original: url
  });
});

// ==================== API: BYPASS ====================
app.post('/api/bypass', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL wajib diisi' });

  if (!/^https?:\/\//i.test(url)) {
    return res.status(400).json({ error: 'URL tidak valid' });
  }

  const result = await bypassSafelink(url);
  res.json(result);
});

app.get('/api/bypass', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL wajib diisi' });
  const result = await bypassSafelink(url);
  res.json(result);
});

app.get('/bypass', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.send('<h1>URL wajib diisi</h1><p>Contoh: /bypass?url=https://bicolink.com/xxx</p>');
  const result = await bypassSafelink(url);
  if (result.success) {
    res.redirect(result.finalUrl);
  } else {
    res.send(`
      <html><body style="background:#0a0a0f;color:#fff;font-family:sans-serif;padding:20px">
      <h1>❌ Gagal Bypass</h1>
      <p>URL: <code style="color:#ff005c;word-break:break-all">${url}</code></p>
      <h3>Langkah yang dicoba:</h3>
      <pre style="background:#12121c;padding:14px;border-radius:10px;overflow:auto">${JSON.stringify(result.steps, null, 2)}</pre>
      <p><a href="/" style="color:#00f260">← Kembali</a></p>
      </body></html>
    `);
  }
});

// ==================== API: INFO ====================
app.get('/api/info/:code', async (req, res) => {
  const { code } = req.params;
  const links = await getLinks();
  if (!links[code]) return res.status(404).json({ error: 'Link tidak ada' });
  const info = links[code];
  res.json({ ok: true, code, url: info.url, clicks: info.clicks, createdAt: info.createdAt });
});

// ==================== API: STATS ====================
app.get('/api/stats/:code', async (req, res) => {
  const { code } = req.params;
  const links = await getLinks();
  if (!links[code]) return res.status(404).json({ error: 'Link tidak ada' });
  const logs = await getStats(code);
  res.json({ ok: true, info: links[code], logs });
});

// ==================== ADMIN ====================
app.get('/api/admin/list', async (req, res) => {
  const links = await getLinks();
  const list = Object.entries(links).map(([code, data]) => ({
    code, url: data.url, clicks: data.clicks, createdAt: data.createdAt, short: `/r/${code}`
  }));
  res.json({ ok: true, total: list.length, list });
});

app.delete('/api/admin/delete/:code', async (req, res) => {
  const { code } = req.params;
  const links = await getLinks();
  if (!links[code]) return res.status(404).json({ error: 'Link tidak ada' });
  await deleteLink(code);
  res.json({ ok: true });
});

// ==================== REDIRECT ====================
app.get('/r/:code', async (req, res) => {
  const { code } = req.params;
  const links = await getLinks();
  const link = links[code];
  if (!link) return res.status(404).send('Link tidak ditemukan');

  link.clicks++;
  links[code] = link;
  await setLinks(links);

  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const ua = req.headers['user-agent'] || '';
  await addStat(code, { t: Date.now(), ip, ua, ref: req.headers['referer'] || '-' });

  res.sendFile(path.join(__dirname, 'public', 'redirect', 'index.html'));
});

app.get('/api/go/:code', async (req, res) => {
  const { code } = req.params;
  const links = await getLinks();
  if (!links[code]) return res.status(404).json({ error: 'Link tidak ada' });
  res.json({ ok: true, url: links[code].url });
});

// ==================== HEALTH ====================
app.get('/health', async (req, res) => {
  const links = await getLinks();
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    links: Object.keys(links).length,
    bypassEngine: 'active'
  });
});

// ==================== VERCEL EXPORT ====================
module.exports = app;