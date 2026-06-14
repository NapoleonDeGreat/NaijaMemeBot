const express = require('express');
const router = express.Router();
const templateSvc = require('../services/templateService');

router.get('/', async (req, res) => {
  try {
    const templates = await templateSvc.getAllTemplates();
    res.json({ templates });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  const { name, filePath, category, emotion, tags } = req.body;
  if (!name || !filePath || !category) {
    return res.status(400).json({ error: 'name, filePath, category required' });
  }
  try {
    const template = await templateSvc.addTemplate({ name, filePath, category, emotion, tags });
    res.json({ template });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
