const wa = require('../services/whatsappService');
const sessionSvc = require('../services/sessionService');
const paymentSvc = require('../services/paymentService');
const gptSvc = require('../services/gptService');
const templateSvc = require('../services/templateService');
const imageSvc = require('../services/imageService');
const voiceSvc = require('../services/voiceService');
const pool = require('../db/pool');

const CATEGORIES = {
  CAT_thank_you: 'thank_you',
  CAT_apology: 'apology',
  CAT_ask_money: 'ask_money',
  CAT_customer_appreciation: 'customer_appreciation',
};

async function handleIncomingMessage(phone, message, messageId) {
  await wa.markRead(messageId);
  await sessionSvc.getOrCreateUser(phone);

  let session = await sessionSvc.getActiveSession(phone);
  const msgText = (message.text?.body || '').trim().toLowerCase();

  if (['hi', 'hello', 'start', 'menu', 'restart', '0'].includes(msgText) || !session) {
    session = await sessionSvc.createSession(phone);
    return sendMenu(phone);
  }

  switch (session.state) {
    case 'MENU': return handleMenuSelection(phone, session, message);
    case 'CATEGORY_SELECTED': return handleRecipientName(phone, session, message);
    case 'RECIPIENT_NAME': return handleNotes(phone, session, message);
    case 'NOTES': return handleNotesInput(phone, session, message);
    case 'AWAITING_VOICE': return handleVoiceOrProceed(phone, session, message);
    case 'AWAITING_PAYMENT': return handlePaymentCheck(phone, session, message);
    default: return sendMenu(phone);
  }
}

async function sendMenu(phone) {
  await wa.sendList(
    phone,
    '🎨 NaijaMeme Bot',
    'Welcome! Which type of message do you want to create?\n\nPick a category below 👇',
    'Choose Category',
    [{
      title: 'Message Types',
      rows: [
        { id: 'CAT_thank_you', title: '🙏 Thank You Message' },
        { id: 'CAT_apology', title: '😔 Apology Message' },
        { id: 'CAT_ask_money', title: '💸 Ask for Money' },
        { id: 'CAT_customer_appreciation', title: '⭐ Customer Appreciation' },
      ],
    }]
  );
}

async function handleMenuSelection(phone, session, message) {
  const selected = message.interactive?.list_reply?.id || message.interactive?.button_reply?.id;
  const category = CATEGORIES[selected];

  if (!category) {
    return wa.sendText(phone, '❌ Please select a valid option. Type *menu* to start over.');
  }

  await sessionSvc.updateSession(session.id, { state: 'CATEGORY_SELECTED', category });
  await wa.sendText(phone, `Great choice! ✅\n\nWhat is the *name* of the person you are sending this to?\n\n_(e.g. Mama, Oga Tony, Chioma)_`);
}

async function handleRecipientName(phone, session, message) {
  const name = message.text?.body?.trim();
  if (!name || name.length < 2) {
    return wa.sendText(phone, '⚠️ Please enter a valid name.');
  }

  await sessionSvc.updateSession(session.id, { state: 'RECIPIENT_NAME', recipient_name: name });
  await wa.sendButtons(
    phone,
    `Perfect! 🎯 Sending to *${name}*.\n\nDo you want to add personal notes to make it more unique?`,
    [
      { id: 'SKIP_NOTES', title: '⏩ Skip' },
      { id: 'ADD_NOTES', title: '✏️ Add Notes' },
    ]
  );
}

async function handleNotes(phone, session, message) {
  const btnId = message.interactive?.button_reply?.id;

  if (btnId === 'ADD_NOTES') {
    await sessionSvc.updateSession(session.id, { state: 'NOTES' });
    return wa.sendText(phone, '✏️ Type your personal note now:\n\n_(e.g. you paid my school fees, you always support me)_');
  }

  await sessionSvc.updateSession(session.id, { state: 'NOTES', notes: null });
  return askForVoiceNote(phone, session.id);
}

async function handleNotesInput(phone, session, message) {
  const notes = message.text?.body?.trim();
  await sessionSvc.updateSession(session.id, { notes });
  return askForVoiceNote(phone, session.id);
}

async function askForVoiceNote(phone, sessionId) {
  await sessionSvc.updateSession(sessionId, { state: 'AWAITING_VOICE' });
  await wa.sendButtons(
    phone,
    '🎤 Optional: Send a voice note for a more personal touch!\n\nOr skip to proceed to payment.',
    [
      { id: 'SKIP_VOICE', title: '⏩ Skip' },
      { id: 'VOICE_READY', title: '🎤 Send Voice' },
    ]
  );
}

async function handleVoiceOrProceed(phone, session, message) {
  const btnId = message.interactive?.button_reply?.id;

  if (btnId === 'SKIP_VOICE') return triggerPayment(phone, session);
  if (btnId === 'VOICE_READY') {
    return wa.sendText(phone, '🎤 Go ahead, record and send your voice note now!');
  }

  if (message.type === 'audio') {
    await wa.sendText(phone, '⏳ Transcribing your voice note...');
    try {
      const { buffer, mimeType } = await wa.downloadMedia(message.audio.id);
      const transcript = await voiceSvc.transcribeVoiceNote(buffer, mimeType);
      await sessionSvc.updateSession(session.id, { voice_transcript: transcript });
      await wa.sendText(phone, `✅ Got it!\n\n_"${transcript}"_`);
    } catch (err) {
      console.error('Voice error:', err.message);
      await wa.sendText(phone, '⚠️ Could not process voice note, proceeding without it.');
    }
    return triggerPayment(phone, session);
  }

  return triggerPayment(phone, session);
}

async function triggerPayment(phone, session) {
  try {
    const { paymentUrl, reference } = await paymentSvc.initializePayment({
      phone,
      sessionId: session.id,
    });

    await sessionSvc.updateSession(session.id, {
      state: 'AWAITING_PAYMENT',
      payment_ref: reference,
    });

    await wa.sendText(
      phone,
      `💳 *Almost there!*\n\nPay *₦500* to generate your meme:\n\n${paymentUrl}\n\n_After payment, type *done* to confirm._`
    );
  } catch (err) {
    console.error('Payment error:', err.message);
    await wa.sendText(phone, '❌ Payment initialization failed. Type *menu* to try again.');
  }
}

async function handlePaymentCheck(phone, session, message) {
  const text = (message.text?.body || '').trim().toLowerCase();
  if (!['done', 'paid', 'complete', 'check'].includes(text)) {
    return wa.sendText(phone, '⏳ Waiting for payment... Type *done* after paying or *menu* to restart.');
  }

  const result = await pool.query(
    "SELECT status FROM payments WHERE session_id = $1 AND status = 'success' LIMIT 1",
    [session.id]
  );

  if (result.rows.length === 0) {
    return wa.sendText(phone, '⚠️ Payment not confirmed yet. Complete payment then type *done*.');
  }

  return generateAndSend(phone, session);
}

async function generateAndSend(phone, session) {
  await wa.sendText(phone, '🎨 Payment confirmed! Generating your meme now...');
  await sessionSvc.updateSession(session.id, { state: 'GENERATING' });

  try {
    const freshSession = await sessionSvc.getSessionById(session.id);
    const caption = await gptSvc.generateCaption({
      category: freshSession.category,
      recipientName: freshSession.recipient_name,
      notes: freshSession.notes,
      voiceTranscript: freshSession.voice_transcript,
    });

    const template = await templateSvc.selectTemplate(freshSession.category);
    const { publicUrl } = await imageSvc.generateMemeImage({
      templatePath: template.file_path,
      caption,
      recipientName: freshSession.recipient_name,
      category: freshSession.category,
    });

    await pool.query(
      `INSERT INTO generated_images (session_id, phone, template_id, caption, recipient_name, image_path)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [session.id, phone, template.id, caption, freshSession.recipient_name, publicUrl]
    );

    await wa.sendImage(phone, publicUrl, caption);
    await sessionSvc.updateSession(session.id, { state: 'DONE', generated_image_url: publicUrl });
    await pool.query(
      'UPDATE users SET total_orders = total_orders + 1, updated_at = NOW() WHERE phone = $1',
      [phone]
    );

    await wa.sendButtons(
      phone,
      `✅ Your meme is ready! Save and send it 🎉\n\nWant to create another one?`,
      [{ id: 'RESTART', title: '🔄 Create Another' }]
    );
  } catch (err) {
    console.error('Generation error:', err.message);
    await sessionSvc.updateSession(session.id, { state: 'DONE' });
    await wa.sendText(phone, '❌ Something went wrong. Type *menu* to try again. Your payment is saved.');
  }
}

module.exports = { handleIncomingMessage, generateAndSend };
