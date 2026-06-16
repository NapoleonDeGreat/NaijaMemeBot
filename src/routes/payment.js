const express = require('express');
const router = express.Router();
const { verifyPayment } = require('../services/paymentService');
const sessionSvc = require('../services/sessionService');
const { generateAndSend } = require('../handlers/conversationHandler');
const wa = require('../services/whatsappService');

const FLW_SECRET_HASH = process.env.FLW_SECRET_HASH;
const ADMIN_PHONE = '2349067140564'; // Napoleon - escalation contact

// ── Flutterwave Webhook ──
router.post('/webhook', express.json(), async (req, res) => {
  // Always acknowledge fast so Flutterwave doesn't retry/timeout
  res.sendStatus(200);

  try {
    const signature = req.headers['verif-hash'];

    // TEMP DEBUG — remove once signature issue is fixed
    console.log('DEBUG received signature:', JSON.stringify(signature), 'length:', signature ? signature.length : 0);
    console.log('DEBUG expected hash:', JSON.stringify(FLW_SECRET_HASH), 'length:', FLW_SECRET_HASH ? FLW_SECRET_HASH.length : 0);

    if (!signature || signature !== FLW_SECRET_HASH) {
      console.warn('⚠️ Invalid Flutterwave signature - ignoring webhook');
      return;
    }

    const event = req.body;
    console.log('FLW Webhook event:', event?.event, event?.data?.status);

    if (event.event === 'charge.completed' && event.data?.status === 'successful') {
      const reference = event.data.tx_ref;
      console.log(`💰 Payment success: ${reference}`);

      const result = await verifyPayment(reference);

      if (result.success && result.phone && result.sessionId) {
        const session = await sessionSvc.getSessionById(result.sessionId);
        if (session && session.state === 'AWAITING_PAYMENT') {
          await sessionSvc.updateSession(session.id, { payment_status: 'paid' });
          await generateAndSend(result.phone, session);
        }
      } else {
        console.error('Payment verified but missing phone/sessionId:', reference);
        await escalateToAdmin(`Payment ${reference} succeeded on Flutterwave but could not be matched to a session. Manual check needed.`);
      }
    }
  } catch (err) {
    console.error('Payment webhook error:', err.message);
    await escalateToAdmin(`Webhook processing crashed: ${err.message}`);
  }
});

// ── Redirect callback (user returns from Flutterwave payment page) ──
router.get('/callback', async (req, res) => {
  const { tx_ref, status } = req.query;
  if (!tx_ref) return res.send('Invalid callback.');

  try {
    const result = await verifyPayment(tx_ref);

    if (result.success) {
      res.send(`
        <html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#1a5c1a;color:white">
          <h2>✅ Payment Successful!</h2>
          <p style="font-size:20px">Go back to WhatsApp — your meme is being generated! 🎨</p>
        </body></html>
      `);

      // Backup trigger in case webhook is delayed/fails — callback page load
      // means user is definitely back, so try generating immediately too.
      if (result.phone && result.sessionId) {
        const session = await sessionSvc.getSessionById(result.sessionId);
        if (session && session.state === 'AWAITING_PAYMENT') {
          await sessionSvc.updateSession(session.id, { payment_status: 'paid' });
          generateAndSend(result.phone, session).catch(err => {
            console.error('Callback-triggered generation failed:', err.message);
          });
        }
      }
    } else {
      res.send(`
        <html><body style="font-family:sans-serif;text-align:center;padding:40px">
          <h2>❌ Payment Failed</h2>
          <p>Please go back to WhatsApp and try again, or type *help* if money was deducted.</p>
        </body></html>
      `);
    }
  } catch (err) {
    console.error('Callback error:', err.message);
    res.send('An error occurred. Please return to WhatsApp and type *help*.');
    await escalateToAdmin(`Callback crashed for tx_ref ${tx_ref}: ${err.message}`);
  }
});

// ── Escalate to admin WhatsApp when payment can't be resolved automatically ──
async function escalateToAdmin(message) {
  try {
    await wa.sendText(ADMIN_PHONE, `🚨 NaijaMeme Bot Alert:\n\n${message}`);
  } catch (err) {
    console.error('Failed to escalate to admin:', err.message);
  }
}

module.exports = router;
