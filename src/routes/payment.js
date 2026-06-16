const express = require('express');
const router = express.Router();
const { verifyPayment } = require('../services/paymentService');
const sessionSvc = require('../services/sessionService');
const { generateAndSend } = require('../handlers/conversationHandler');

const FLW_SECRET_HASH = process.env.FLW_SECRET_HASH;

router.post('/webhook', express.json(), async (req, res) => {
  const signature = req.headers['verif-hash'];
  if (!signature) {
    console.warn('No signature provided');
    return res.sendStatus(401);
  }
  // Log for debugging
  console.log('Signature received:', signature);
  console.log('Expected:', expectedHash);
  // Temporarily accept all signatures to debug
  // if (signature !== expectedHash) return res.sendStatus(401);

  }

  res.sendStatus(200);

  const event = req.body;
  if (event.event === 'charge.completed' && event.data?.status === 'successful') {
    const reference = event.data.tx_ref;
    console.log(`Payment success: ${reference}`);

    try {
      const result = await verifyPayment(reference);
      if (result.success && result.phone && result.sessionId) {
        const session = await sessionSvc.getSessionById(result.sessionId);
        if (session && session.state === 'AWAITING_PAYMENT') {
          await sessionSvc.updateSession(session.id, { payment_status: 'paid' });
          await generateAndSend(result.phone, session);
        }
      }
    } catch (err) {
      console.error('Payment webhook error:', err.message);
    }
  }
});

router.get('/callback', async (req, res) => {
  const { tx_ref } = req.query;
  if (!tx_ref) return res.send('Invalid callback.');

  try {
    const result = await verifyPayment(tx_ref);
    if (result.success) {
      res.send(`
        <html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#1a5c1a;color:white">
          <h2>✅ Payment Successful!</h2>
          <p style="font-size:20px">Go back to WhatsApp and type <strong>done</strong> to receive your meme.</p>
        </body></html>
      `);
    } else {
      res.send(`
        <html><body style="font-family:sans-serif;text-align:center;padding:40px">
          <h2>❌ Payment Failed</h2>
          <p>Please go back to WhatsApp and try again.</p>
        </body></html>
      `);
    }
  } catch (err) {
    res.send('An error occurred. Please return to WhatsApp.');
  }
});

module.exports = router;
