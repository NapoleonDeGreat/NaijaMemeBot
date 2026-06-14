const express = require('express');
const router = express.Router();
const imageSvc = require('../services/imageService');
const gptSvc = require('../services/gptService');
const templateSvc = require('../services/templateService');

router.post('/', async (req, res) => {
  const { category, recipientName, notes } = req.body;
  if (!category || !recipientName) {
    return res.status(400).json({ error: 'category and recipientName required' });
  }
  try {
    const caption = await gptSvc.generateCaption({ category, recipientName, notes });
    const template = await templateSvc.selectTemplate(category);
    const image = await imageSvc.generateMemeImage({
      templatePath: template.file_path,
      caption,
      recipientName,
      category,
    });
    res.json({ caption, imageUrl: image.publicUrl });
  } catch (err) {
    console.error('Generate error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
