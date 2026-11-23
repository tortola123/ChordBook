require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Song = require('../models/Song');

const app = express();
app.use(express.json());

// Cache the connection so serverless calls on Vercel reuse it
const cached = global._mongoose || (global._mongoose = { conn: null, promise: null });
async function connect() {
  if (cached.conn) return cached.conn;
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
  cached.promise = cached.promise || mongoose.connect(process.env.MONGODB_URI);
  cached.conn = await cached.promise;
  return cached.conn;
}
app.use('/api', async (req, res, next) => {
  try { await connect(); next(); }
  catch (err) { cached.promise = null; res.status(500).json({ error: 'Database connection failed: ' + err.message }); }
});

// ---------- helpers ----------
const sign = (u) => jwt.sign({ id: String(u._id), username: u.username }, process.env.JWT_SECRET, { expiresIn: '7d' });
const readToken = (req) => jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), process.env.JWT_SECRET);
const auth = (req, res, next) => {
  try { req.user = readToken(req); next(); } catch { res.status(401).json({ error: 'Please log in' }); }
};
const optionalAuth = (req, _res, next) => { try { req.user = readToken(req); } catch {} next(); };
const validId = (req, res, next) =>
  mongoose.isValidObjectId(req.params.id) ? next() : res.status(400).json({ error: 'Invalid id' });
const fail = (res, err) => {
  if (err.name === 'ValidationError') return res.status(400).json({ error: Object.values(err.errors)[0].message });
  res.status(500).json({ error: err.message });
};
// Only allow fields a user is meant to set
function clean(b) {
  const o = {};
  for (const k of ['title', 'key', 'timeSignature', 'genre', 'status']) if (b[k] !== undefined && b[k] !== '') o[k] = b[k];
  if (Array.isArray(b.lines)) {
    o.lines = b.lines.map((l) => ({
      chords: (l.chords || []).map((c) => ({ symbol: String(c.symbol || '').trim(), beats: Number(c.beats) || 2 }))
    }));
  }
  return o;
}

// ---------- accounts ----------
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!password || password.length < 8) return res.status(400).json({ error: 'Password needs at least 8 characters' });
    const user = await User.create({ username, email, passwordHash: await bcrypt.hash(password, 10) });
    res.status(201).json({ token: sign(user), user: { id: user._id, username: user.username } });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'That username or email is already taken' });
    fail(res, err);
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const user = await User.findOne({ email: String(req.body.email || '').toLowerCase().trim() });
    const ok = user && (await bcrypt.compare(String(req.body.password || ''), user.passwordHash));
    if (!ok) return res.status(401).json({ error: 'Incorrect email or password' });
    res.json({ token: sign(user), user: { id: user._id, username: user.username } });
  } catch (err) { fail(res, err); }
});

// ---------- songs ----------
// CREATE
app.post('/api/songs', auth, async (req, res) => {
  try {
    res.status(201).json(await Song.create({ ...clean(req.body), owner: req.user.id, ownerName: req.user.username }));
  } catch (err) { fail(res, err); }
});

// READ many: ?scope=discover (default, published songs) or ?scope=mine (needs login)
// optional filters: q, key, timeSignature, genre, limit
app.get('/api/songs', optionalAuth, async (req, res) => {
  try {
    const { scope = 'discover', q, key, timeSignature, genre, limit } = req.query;
    const filter = {};
    if (scope === 'mine') {
      if (!req.user) return res.status(401).json({ error: 'Please log in' });
      filter.owner = req.user.id;
    } else filter.status = 'published';
    if (key) filter.key = key;
    if (timeSignature) filter.timeSignature = timeSignature;
    if (genre) filter.genre = genre;
    if (q) filter.title = { $regex: String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    res.json(await Song.find(filter).sort({ createdAt: -1 }).limit(Math.min(Number(limit) || 100, 100)));
  } catch (err) { fail(res, err); }
});

// READ one (published songs, or your own drafts)
app.get('/api/songs/:id', optionalAuth, validId, async (req, res) => {
  try {
    const doc = await Song.findById(req.params.id);
    if (!doc || (doc.status !== 'published' && String(doc.owner) !== req.user?.id)) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) { fail(res, err); }
});

// UPDATE (owner only)
app.put('/api/songs/:id', auth, validId, async (req, res) => {
  try {
    const doc = await Song.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    if (String(doc.owner) !== req.user.id) return res.status(403).json({ error: 'You can only edit your own songs' });
    doc.set(clean(req.body));
    res.json(await doc.save());
  } catch (err) { fail(res, err); }
});

// DELETE (owner only)
app.delete('/api/songs/:id', auth, validId, async (req, res) => {
  try {
    const doc = await Song.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    if (String(doc.owner) !== req.user.id) return res.status(403).json({ error: 'You can only delete your own songs' });
    await doc.deleteOne();
    res.json({ deleted: true });
  } catch (err) { fail(res, err); }
});

module.exports = app;
