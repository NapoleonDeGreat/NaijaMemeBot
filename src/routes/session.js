const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

router.get('/:phone', async (req, res) => {
  const { phone } = req.params;
  try {
    const result = await pool.query(
      `SELECT s.*, p.status as payment_status 
       FROM sessions s
       LEFT JOIN payments p ON p.session_id = s.id
       WHERE s.phone = $1 
       ORDER BY s.created_at DESC LIMIT 5`,
      [phone]
    );
    res.json({ sessions: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
