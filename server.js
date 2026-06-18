const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const multer = require('multer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Middleware
app.use(cors({
  origin: ['https://acpella.netlify.app', 'http://localhost:3000', '*'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ extended: true, limit: '200mb' }));

// Init database tables
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS content (
        id SERIAL PRIMARY KEY,
        key VARCHAR(255) UNIQUE NOT NULL,
        value TEXT,
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS announcements (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        body TEXT,
        date DATE DEFAULT CURRENT_DATE,
        image TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS gallery (
        id SERIAL PRIMARY KEY,
        image_data TEXT NOT NULL,
        caption TEXT,
        category VARCHAR(50) DEFAULT 'egkat',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅ Database tables ready');
  } catch (err) {
    console.error('DB init error:', err);
  }
}

// ─── ADMIN AUTH ───
const ADMIN_USER = 'admin.acpella';
const ADMIN_PASS = 'acpella123';

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    res.json({ success: true, token: 'acpella-admin-2025' });
  } else {
    res.status(401).json({ success: false, message: 'Λάθος στοιχεία' });
  }
});

function authMiddleware(req, res, next) {
  const token = req.headers.authorization;
  if (token === 'Bearer acpella-admin-2025') {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

// ─── CONTENT API ───
// Get all content
app.get('/api/content', async (req, res) => {
  try {
    const result = await pool.query('SELECT key, value FROM content');
    const content = {};
    result.rows.forEach(row => { content[row.key] = row.value; });
    res.json(content);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save content (admin only)
app.post('/api/content', authMiddleware, async (req, res) => {
  try {
    const { items } = req.body; // Array of {key, value}
    for (const item of items) {
      await pool.query(`
        INSERT INTO content (key, value) VALUES ($1, $2)
        ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()
      `, [item.key, item.value]);
    }
    res.json({ success: true, saved: items.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ANNOUNCEMENTS API ───
// Get all announcements
app.get('/api/announcements', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM announcements ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add announcement (admin only)
app.post('/api/announcements', authMiddleware, async (req, res) => {
  try {
    const { title, body, date, image } = req.body;
    const result = await pool.query(
      'INSERT INTO announcements (title, body, date, image) VALUES ($1, $2, $3, $4) RETURNING *',
      [title, body, date || new Date().toISOString().split('T')[0], image || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete announcement (admin only)
app.delete('/api/announcements/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM announcements WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GALLERY API ───
// Get all gallery images
app.get('/api/gallery', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, caption, category, image_data FROM gallery ORDER BY created_at ASC'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add gallery image (admin only) - base64
app.post('/api/gallery', authMiddleware, async (req, res) => {
  try {
    const { image_data, caption, category } = req.body;
    const result = await pool.query(
      'INSERT INTO gallery (image_data, caption, category) VALUES ($1, $2, $3) RETURNING id',
      [image_data, caption || '', category || 'egkat']
    );
    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete gallery image (admin only)
app.delete('/api/gallery/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM gallery WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'A.C. Pella API running' });
});

// Start server
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 A.C. Pella API running on port ${PORT}`);
  });
});
