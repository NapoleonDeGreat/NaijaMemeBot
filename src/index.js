require('dotenv').config();
const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/generated', express.static(path.join(__dirname, '../public/generated')));

app.use('/webhook', require('./routes/webhook'));
app.use('/payment', require('./routes/payment'));
app.use('/generate-image', require('./routes/generate'));
app.use('/templates', require('./routes/templates'));
app.use('/session', require('./routes/session'));

app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date() }));

async function runMigration() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: false,
  });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        phone VARCHAR(20) UNIQUE NOT NULL,
        display_name VARCHAR(100),
        total_orders INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        phone VARCHAR(20) NOT NULL REFERENCES users(phone) ON DELETE CASCADE,
        state VARCHAR(50) NOT NULL DEFAULT 'IDLE',
        category VARCHAR(50),
        recipient_name VARCHAR(100),
        notes TEXT,
        voice_transcript TEXT,
        payment_ref VARCHAR(100),
        payment_status VARCHAR(20) DEFAULT 'pending',
        generated_image_url TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        phone VARCHAR(20) NOT NULL,
        session_id INTEGER REFERENCES sessions(id),
        reference VARCHAR(100) UNIQUE NOT NULL,
        amount INTEGER NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        gateway VARCHAR(20) DEFAULT 'flutterwave',
        gateway_response JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        verified_at TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS templates (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        file_path VARCHAR(255) NOT NULL,
        category VARCHAR(50) NOT NULL,
        emotion VARCHAR(50),
        tags TEXT[],
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS generated_images (
        id SERIAL PRIMARY KEY,
        session_id INTEGER REFERENCES sessions(id),
        phone VARCHAR(20) NOT NULL,
        template_id INTEGER REFERENCES templates(id),
        caption TEXT,
        recipient_name VARCHAR(100),
        image_path TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_phone ON sessions(phone);
      CREATE INDEX IF NOT EXISTS idx_sessions_state ON sessions(state);
      CREATE INDEX IF NOT EXISTS idx_payments_reference ON payments(reference);
      CREATE INDEX IF NOT EXISTS idx_payments_phone ON payments(phone);
    `);
    console.log('✅ Migration complete');
  } catch (err) {
    console.error('❌ Migration error:', err.message);
  } finally {
    await pool.end();
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`NaijaMeme Bot running on port ${PORT}`);
  await runMigration();
});
