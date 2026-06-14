const pool = require('../db/pool');

const LOCAL_TEMPLATES = {
  thank_you: [
    { id: 1, file_path: './assets/templates/thank_you_1.jpg', emotion: 'happy' },
  ],
  apology: [
    { id: 2, file_path: './assets/templates/apology_1.jpg', emotion: 'sad' },
  ],
  ask_money: [
    { id: 3, file_path: './assets/templates/ask_money_1.jpg', emotion: 'begging' },
  ],
  customer_appreciation: [
    { id: 4, file_path: './assets/templates/customer_appreciation_1.jpg', emotion: 'happy' },
  ],
};

async function selectTemplate(category) {
  try {
    const result = await pool.query(
      `SELECT * FROM templates 
       WHERE category = $1 AND is_active = TRUE 
       ORDER BY RANDOM() LIMIT 1`,
      [category]
    );
    if (result.rows.length > 0) return result.rows[0];
  } catch (err) {
    console.error('Template DB error, falling back to local:', err.message);
  }
  const locals = LOCAL_TEMPLATES[category] || LOCAL_TEMPLATES.thank_you;
  return locals[Math.floor(Math.random() * locals.length)];
}

async function getAllTemplates() {
  const result = await pool.query(
    'SELECT id, name, category, emotion, tags, is_active FROM templates ORDER BY category, id'
  );
  return result.rows;
}

async function addTemplate({ name, filePath, category, emotion, tags }) {
  const result = await pool.query(
    `INSERT INTO templates (name, file_path, category, emotion, tags) 
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [name, filePath, category, emotion, tags || []]
  );
  return result.rows[0];
}

module.exports = { selectTemplate, getAllTemplates, addTemplate };
