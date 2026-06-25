require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const schema = `
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

CREATE TABLE IF NOT EXISTS feedback (
  id SERIAL PRIMARY KEY,
  session_id INTEGER REFERENCES sessions(id),
  phone VARCHAR(20) NOT NULL,
  category VARCHAR(50),
  rating INTEGER,
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_phone ON sessions(phone);
CREATE INDEX IF NOT EXISTS idx_sessions_state ON sessions(state);
CREATE INDEX IF NOT EXISTS idx_payments_reference ON payments(reference);
CREATE INDEX IF NOT EXISTS idx_payments_phone ON payments(phone);

-- Add all missing columns safely (IF NOT EXISTS prevents errors if already added)
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS mode VARCHAR(20);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS gender VARCHAR(10);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS photo_urls TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS photo_local_paths TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS photo_types TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS photo_upload_count INTEGER DEFAULT 0;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS photo_role_step INTEGER DEFAULT 0;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS structured_step INTEGER DEFAULT 0;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS has_no_logo BOOLEAN DEFAULT FALSE;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS outfit_preference TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS voice_language VARCHAR(20);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS generated_image_local_path TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS feedback_rating INTEGER;

-- Structured flyer fields
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS event_subtype TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS church_name TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS programme_title TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS theme TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS event_date TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS event_time TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS venue TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS guest_minister TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS style_preference TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS business_name TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS offer_product TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS positioning TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS contact_info TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS candidate_name TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS position_title TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS party_slogan TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS election_date TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS school_name TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS achievement_name TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS achievement_date TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS celebrant_name TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS celebration_date TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS celebrant_relationship TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS celebration_wish TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS baby_name TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS parents_names TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS naming_date TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS naming_venue TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS bride_name TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS groom_name TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS wedding_date TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS wedding_venue TEXT;

-- Music fields
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS music_genre VARCHAR(50);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS music_occasion TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS music_person_name TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS music_language TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS music_story TEXT;
`;

async function migrate() {
  console.log('Running migrations...');
  const client = await pool.connect();
  try {
    await client.query(schema);
    console.log('Migration complete');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
