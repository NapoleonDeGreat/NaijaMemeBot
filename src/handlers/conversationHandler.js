const wa = require('../services/whatsappService');
const sessionSvc = require('../services/sessionService');
const paymentSvc = require('../services/paymentService');
const { generateCaptionAndImagePrompt } = require('../services/gptService');
const imageSvc = require('../services/imageService');
const voiceSvc = require('../services/voiceService');
const pool = require('../db/pool');

const CATEGORIES = {
  CAT_thank_you: 'thank_you',
  CAT_apology: 'apology',
  CAT_ask_money: 'ask_money',
  CAT_customer_appreciation: 'customer_appreciation',
  CAT_congratulations: 'congratulations',
  CAT_church: 'church',
  CAT_business_advert: 'business_advert',
  CAT_political: 'political',
  CAT_relationship: 'relationship',
  CAT_academic: 'academic',
};

const CATEGORY_LABELS = {
  thank_you: '🙏 Thank You',
  apology: '😔 Apology',
  ask_money: '💸 Ask for Money',
  customer_appreciation: '⭐ Customer Appreciation',
  congratulations: '🎉 Congratulations',
  church: '⛪ Church/Ministry',
  business_advert: '📢 Business Advert',
  political: '🗳️ Political Campaign',
  relationship: '💔 Shoot Your Shot',
  academic: '🎓 Academic Achievement',
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
    case 'RECIPIENT_NAME': return handleGender(phone, session, message);
    case 'GENDER': return handleVoiceOrText(phone, session, message);
    case 'AWAITING_VOICE': return handleVoiceInput(phone, session, message);
    case 'AWAITING_PAYMENT': return handlePaymentCheck(phone, session, message);
    case 'AWAITING_SHOUTOUT': return handleShoutoutDecision(phone, session, message);
    default: return sendMenu(phone);
  }
}

async function sendMenu(phone) {
  await wa.sendList(
    phone,
    '🎨 NaijaMeme Bot',
  'Welcome! What type of meme/flier do you want to create?\n\nPick a category below 👇',
 'Choose Category',
    [
      {
        title: 'Personal Messages',
        rows: [
          { id: 'CAT_thank_you', title: '🙏 Thank You Message' },
          { id: 'CAT_apology', title: '😔 Apology Message' },
          { id: 'CAT_ask_money', title: '💸 Ask for Money' },
          { id: 'CAT_relationship', title: '💔 Shoot Your Shot' },
          { id: 'CAT_congratulations', title: '🎉 Congratulations' },
        ],
      },
      {
        title: 'Business & Special',
        rows: [
          { id: 'CAT_customer_appreciation', title: '⭐ Customer Appreciation' },
          { id: 'CAT_business_advert', title: '📢 Business Advert' },
          { id: 'CAT_church', title: '⛪ Church/Ministry' },
          { id: 'CAT_political', title: '🗳️ Political Campaign' },
          { id: 'CAT_academic', title: '🎓 Academic Achievement' },
        ],
      },
    ]
  );
}

async function handleMenuSelection(phone, session, message) {
  const selected = message.interactive?.list_reply?.id || message.interactive?.button_reply?.id;
  const category = CATEGORIES[selected];

  if (!category) {
    return wa.sendText(phone, '❌ Please select a valid option. Type *menu* to start over.');
  }

  await sessionSvc.updateSession(session.id, { state: 'CATEGORY_SELECTED', category });
  await wa.sendText(
    phone,
    `${CATEGORY_LABELS[category]} selected! ✅\n\nWhat is the *name* of the person you are sending this to?\n\n_(e.g. Mama, Oga Tony, Chioma, Pastor Mike)_`
  );
}

async function handleRecipientName(phone, session, message) {
  const name = message.text?.body?.trim();
  if (!name || name.length < 2) {
    return wa.sendText(phone, '⚠️ Please enter a valid name.');
  }

  await sessionSvc.updateSession(session.id, { state: 'RECIPIENT_NAME', recipient_name: name });
  await wa.sendButtons(
    phone,
    `Perfect! Sending to *${name}* 🎯\n\nWhat gender is ${name}?`,
    [
      { id: 'GENDER_MALE', title: '👨 Male' },
      { id: 'GENDER_FEMALE', title: '👩 Female' },
    ]
  );
}

async function handleGender(phone, session, message) {
  const btnId = message.interactive?.button_reply?.id;
  const gender = btnId === 'GENDER_MALE' ? 'male' : btnId === 'GENDER_FEMALE' ? 'female' : null;

  if (!gender) {
    return wa.sendButtons(
      phone,
      'Please select the gender:',
      [
        { id: 'GENDER_MALE', title: '👨 Male' },
        { id: 'GENDER_FEMALE', title: '👩 Female' },
      ]
    );
  }

  await sessionSvc.updateSession(session.id, { state: 'GENDER', notes: gender });
  await wa.sendButtons(
    phone,
    `🎤 Now send a voice note and watch your meme unfold like magic! ✨\n\nTell us what you want to say — we go turn am to something beautiful.\n\nOr type your message if you prefer.`,
    [
      { id: 'TYPE_MESSAGE', title: '⌨️ Type Instead' },
    ]
  );
  await sessionSvc.updateSession(session.id, { state: 'AWAITING_VOICE' });
}

async function handleVoiceOrText(phone, session, message) {
  return handleVoiceInput(phone, session, message);
}

async function handleVoiceInput(phone, session, message) {
  const btnId = message.interactive?.button_reply?.id;

  if (btnId === 'TYPE_MESSAGE') {
    await sessionSvc.updateSession(session.id, { state: 'AWAITING_VOICE' });
    return wa.sendText(phone, '⌨️ Type your message now — tell us what you want to say to them:');
  }

  // Handle voice note
  if (message.type === 'audio') {
    await wa.sendText(phone, '⏳ Got your voice note! Transcribing...');
    try {
      const { buffer, mimeType } = await wa.downloadMedia(message.audio.id);
      const transcript = await voiceSvc.transcribeVoiceNote(buffer, mimeType);
      await sessionSvc.updateSession(session.id, { voice_transcript: transcript });
      await wa.sendText(phone, `✅ Perfect! I heard:\n\n_"${transcript}"_\n\nGenerating your meme now... 🎨`);
      return triggerPayment(phone, session);
    } catch (err) {
      console.error('Voice error:', err.message);
      await wa.sendText(phone, '⚠️ Could not process voice note. Please type your message instead:');
      return;
    }
  }

  // Handle typed message
  if (message.text?.body) {
    const typed = message.text.body.trim();
    if (typed.length > 2) {
      await sessionSvc.updateSession(session.id, { voice_transcript: typed });
      await wa.sendText(phone, `✅ Got it! Generating your meme now... 🎨`);
      return triggerPayment(phone, session);
    }
  }

  await wa.sendText(phone, '⚠️ Please send a voice note or type your message.');
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
      `💳 *Almost there!*\n\nPay *₦500* to unlock your meme:\n\n${paymentUrl}\n\n_After payment, type *done* to confirm._`
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
  await wa.sendText(phone, '🎨 Payment confirmed! Creating your unique meme now...\n\n_This takes about 15 seconds ✨_');
  await sessionSvc.updateSession(session.id, { state: 'GENERATING' });

  try {
    const freshSession = await sessionSvc.getSessionById(session.id);

    // Generate caption and image prompt together
    const { caption, imagePrompt } = await generateCaptionAndImagePrompt({
      category: freshSession.category,
      recipientName: freshSession.recipient_name,
      voiceTranscript: freshSession.voice_transcript,
      notes: freshSession.notes,
      gender: freshSession.notes, // gender stored in notes field temporarily
    });

    // Generate image with GPT Image 1.5
    const { publicUrl } = await imageSvc.generateMemeImage({
      imagePrompt,
      recipientName: freshSession.recipient_name,
      category: freshSession.category,
    });

    // Log generated image
    await pool.query(
      `INSERT INTO generated_images (session_id, phone, caption, recipient_name, image_path)
       VALUES ($1, $2, $3, $4, $5)`,
      [session.id, phone, caption, freshSession.recipient_name, publicUrl]
    );

    // Send the meme using our own hosted URL (GPT Image returns base64, no external URL)
    await wa.sendImage(phone, publicUrl, caption);

    // Update session
    await sessionSvc.updateSession(session.id, {
      state: 'AWAITING_SHOUTOUT',
      generated_image_url: publicUrl,
    });

    await pool.query(
      'UPDATE users SET total_orders = total_orders + 1, updated_at = NOW() WHERE phone = $1',
      [phone]
    );

    // Offer ElevenLabs shoutout
    await wa.sendButtons(
      phone,
      `✅ Your meme don land! 🔥\n\nWant a *voice shoutout* to go with it? We go record the caption in a dramatic Nigerian accent — send to ${freshSession.recipient_name} for extra effect! 🎤\n\n_Just ₦200 extra_`,
      [
        { id: 'SHOUTOUT_YES', title: '🎤 Yes! Add Shoutout' },
        { id: 'SHOUTOUT_NO', title: '✅ No, Am Good' },
      ]
    );
  } catch (err) {
    console.error('Generation error:', err.message);
    // TEMP DEBUG — print the full error so we can see OpenAI's actual reason
    console.error('Generation error FULL DETAIL:', JSON.stringify(err.error || err.response?.data || err, Object.getOwnPropertyNames(err)));
    await sessionSvc.updateSession(session.id, { state: 'DONE' });
    await wa.sendText(phone, '❌ Something went wrong generating your meme. Type *menu* to try again. Your payment is saved.');
  }
}

async function handleShoutoutDecision(phone, session, message) {
  const btnId = message.interactive?.button_reply?.id;

  if (btnId === 'SHOUTOUT_YES') {
    await sessionSvc.updateSession(session.id, { state: 'DONE' });
    // ElevenLabs integration - Phase 2
    await wa.sendText(phone, '🎤 Shoutout feature coming very soon! Watch this space 🔥\n\nType *menu* to create another meme.');
  } else {
    await sessionSvc.updateSession(session.id, { state: 'DONE' });
    await wa.sendButtons(
      phone,
      `🔥 Your meme don ready! Save am and send to ${(await sessionSvc.getSessionById(session.id))?.recipient_name || 'them'}!\n\nWant to create another one?`,
      [{ id: 'RESTART', title: '🔄 Create Another' }]
    );
  }
}

module.exports = { handleIncomingMessage, generateAndSend };
