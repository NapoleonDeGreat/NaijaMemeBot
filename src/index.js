require('dotenv').config();
const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve generated meme images publicly
app.use('/generated', express.static(path.join(__dirname, '../public/generated')));

// Routes
app.use('/webhook', require('./routes/webhook'));
app.use('/payment', require('./routes/payment'));
app.use('/generate-image', require('./routes/generate'));
app.use('/templates', require('./routes/templates'));
app.use('/session', require('./routes/session'));

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date() }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`NaijaMeme Bot running on port ${PORT}`);
});
