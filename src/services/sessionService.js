const pool = require('../db/pool');

async function getOrCreateUser(phone) {
  const existing = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
  if (existing.rows.length > 0) return existing.rows[0];
  const result = await pool.query(
    'INSERT INTO users (phone) VALUES ($1) RETURNING *',
    [phone]
  );
  return result.rows[0];
}

async function getActiveSession(phone) {
  const result = await pool.query(
    `SELECT * FROM sessions 
     WHERE phone = $1 AND state NOT IN ('DONE') 
     ORDER BY created_at DESC LIMIT 1`,
    [phone]
  );
  return result.rows[0] || null;
}

async function createSession(phone) {
  await pool.query(
    "UPDATE sessions SET state = 'DONE' WHERE phone = $1 AND state NOT IN ('DONE')",
    [phone]
  );
  const result = await pool.query(
    `INSERT INTO sessions (phone, state) VALUES ($1, 'MENU') RETURNING *`,
    [phone]
  );
  return result.rows[0];
}

async function updateSession(sessionId, updates) {
  const keys = Object.keys(updates);
  const values = Object.values(updates);
  const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  const result = await pool.query(
    `UPDATE sessions SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [sessionId, ...values]
  );
  return result.rows[0];
}

async function getSessionById(id) {
  const result = await pool.query('SELECT * FROM sessions WHERE id = $1', [id]);
  return result.rows[0] || null;
}

module.exports = { getOrCreateUser, getActiveSession, createSession, updateSession, getSessionById };
