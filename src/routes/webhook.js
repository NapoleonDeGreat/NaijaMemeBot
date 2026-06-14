const express = require('express');
const router = express.Router();
const { handleIncomingMessage } = require('../handlers/conversationHandler');

router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('WhatsApp webhook verified');
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

router.post('/', async (req, res) => {
  res.sendStatus(200);
  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value;
        if (!value?.messages) continue;
        for (const message of value.messages) {
          const phone = message.from;
          const messageId = message.id;
          console.log(`Message from ${phone}: type=${message.type}`);
          handleIncomingMessage(phone, message, messageId).catch(err => {
            console.error(`Handler error for ${phone}:`, err.message);
          });
        }
      }
    }
  } catch (err) {
    console.error('Webhook error:', err.message);
  }
});

module.exports = router;
