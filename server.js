const express = require('express');
const fs = require('fs');
const path = require('path');
const { customAlphabet } = require('nanoid');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'database.json');

const nano = customAlphabet('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 6);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));
app.use('/r', express.static(path.join(__dirname, 'redirect')));

// Init database
let db = { links: {}, stats: {} };
if (fs.existsSync(DB_FILE)) {
  try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) {}
}
function saveDb() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// === API: buat link pendek ===
app.post('/api/shorten', (req, res) => {
  const { url, slug } = req.body;
  if (!url) return res.status(400).json({ error: 'URL wajib diisi' });

  let code = slug && slug.trim() ? slug.trim() : nano();
  if (db.links[code]) code = nano();

  db.links[code] = {
    url,
    createdAt: Date.now(),
    clicks: 0
  };
  db.stats[code] = [];
  saveDb();

  res.json({
    ok: true,
    code,
    short: `${req.protocol}://${req.get('host')}/r/${code}`,
    original: url
  });
});

// === API: ambil info link ===
app.get('/api/info/:code', (req, res) => {
  const { code } = req.params;
  if (!db.links[code]) return res.status(404).json({ error: 'Link tidak ada' });

  const info = db.links[code];
  res.json({
    ok: true,
    code,
    url: info.url,
    clicks: info.clicks,
    createdAt: info.createdAt
  });
});

// === API: statistik lengkap ===
app.get('/api/stats/:code', (req, res) => {
  const { code } = req.params;
  if (!db.links[code]) return res.status(404).json({ error: 'Link tidak ada' });

  res.json({
    ok: true,
    info: db.links[code],
    logs: db.stats[code] || []
  });
});

// === API: admin — list semua link ===
app.get('/api/admin/list', (req, res) => {
  const list = Object.entries(db.links).map(([code, data]) => ({
    code,
    url: data.url,
    clicks: data.clicks,
    createdAt: data.createdAt,
    short: `/r/${code}`
  }));
  res.json({ ok: true, total: list.length, list });
});

// === API: admin — hapus link ===
app.delete('/api/admin/delete/:code', (req, res) => {
  const { code } = req.params;
  if (!db.links[code]) return res.status(404).json({ error: 'Link tidak ada' });
  delete db.links[code];
  delete db.stats[code];
  saveDb();
  res.json({ ok: true });
});

// === BYPASS: ambil URL asli tanpa halaman iklan ===
app.get('/api/bypass/:code', (req, res) => {
  const { code } = req.params;
  if (!db.links[code]) return res.status(404).json({ error: 'Link tidak ada' });
  res.json({ ok: true, url: db.links[code].url });
});

// === REDIRECT dengan tracking ===
app.get('/r/:code', (req, res) => {
  const { code } = req.params;
  const link = db.links[code];
  if (!link) return res.status(404).send('Link tidak ditemukan');

  // Simpan statistik
  link.clicks++;
  const ua = req.headers['user-agent'] || '';
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const entry = {
    t: Date.now(),
    ip: ip,
    ua: ua,
    ref: req.headers['referer'] || '-'
  };
  if (!db.stats[code]) db.stats[code] = [];
  db.stats[code].push(entry);
  if (db.stats[code].length > 500) db.stats[code].shift();
  saveDb();

  // Tampilkan halaman perantara
  const target = encodeURIComponent(link.url);
  res.sendFile(path.join(__dirname, 'redirect', 'index.html'));
});

// === API: submit dari halaman redirect ===
app.get('/api/go/:code', (req, res) => {
  const { code } = req.params;
  if (!db.links[code]) return res.status(404).json({ error: 'Link tidak ada' });
  res.json({ ok: true, url: db.links[code].url });
});

// === HEALTH ===
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), links: Object.keys(db.links).length });
});

app.listen(PORT, () => {
  console.log(`Server jalan di http://localhost:${PORT}`);
});