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

// Categories that go through the structured question flow before
// the recipient-name/voice-note flow. Everything else (thank_you,
// apology, ask_money, congratulations, relationship) skips straight
// to the original simple flow.
const STRUCTURED_CATEGORIES = new Set([
  'church',
  'business_advert',
  'customer_appreciation',
  'political',
  'academic',
]);

// Ordered list of questions per structured category.
// Each entry: { field: <session column name>, prompt: <question text> }
const STRUCTURED_QUESTIONS = {
  church: [
    { field: 'church_name', prompt: 'What is the *name of the church*?' },
    { field: 'programme_title', prompt: 'What is the *programme title*?\n\n_(e.g. Revival Worship Experience)_' },
    { field: 'theme', prompt: 'What is the *theme* of the programme?\n\n_(e.g. A Call For Revival)_' },
    { field: 'event_date', prompt: 'What *date* is the programme?\n\n_(e.g. Sunday 1st March 2026)_' },
    { field: 'event_time', prompt: 'What *time* does it start?\n\n_(e.g. 2:30PM)_' },
    { field: 'venue', prompt: 'What is the *venue*?\n\n_(e.g. Chapel of Salvation, Nasarawa State University Keffi)_' },
    { field: 'guest_minister', prompt: 'Who is the *guest minister or speaker*?\n\n_(Type "none" if there isn\'t one)_' },
  ],
  business_advert: [
    { field: 'business_name', prompt: 'What is the *name of your business*?' },
    { field: 'offer_product', prompt: 'What *product, service, or offer* are you advertising?' },
    { field: 'contact_info', prompt: 'What *contact info* should we show?\n\n_(phone number, WhatsApp, or social handle)_' },
  ],
  customer_appreciation: [
    { field: 'business_name', prompt: 'What is the *name of your business*?' },
    { field: 'offer_product', prompt: 'What is this customer being appreciated for?\n\n_(e.g. 1 year loyalty, referring new customers, 5-star review)_' },
    { field: 'contact_info', prompt: 'What *contact info* should we show?\n\n_(phone number, WhatsApp, or social handle -- type "none" to skip)_' },
  ],
  political: [
    { field: 'candidate_name', prompt: 'What is the *candidate\'s name*?' },
    { field: 'position_title', prompt: 'What *position* are they contesting for?\n\n_(e.g. Local Government Chairman)_' },
    { field: 'party_slogan', prompt: 'What is the *party name and/or campaign slogan*?' },
    { field: 'election_date', prompt: 'What is the *election date* or event date?' },
  ],
  academic: [
    { field: 'school_name', prompt: 'What is the *name of the school/institution*?' },
    { field: 'achievement_name', prompt: 'What is the *achievement or event*?\n\n_(e.g. First Class Graduation, NYSC Call-Up, WAEC Result)_' },
    { field: 'achievement_date', prompt: 'What *date* should we show?' },
  ],
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
    case 'STRUCTURED_QA': return handleStructuredAnswer(phone, session, message);
    case 'AWAITING_PHOTO_DECISION': return handlePhotoDecision(phone, session, message);
    case 'AWAITING_PHOTO_UPLOAD': return handlePhotoUpload(phone, session, message);
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

  if (STRUCTURED_CATEGORIES.has(category)) {
    // Kick off structured Q&A flow -- ask the first question
    const questions = STRUCTURED_QUESTIONS[category];
    await sessionSvc.updateSession(session.id, {
      state: 'STRUCTURED_QA',
      category,
      structured_step: 0,
    });
    await wa.sendText(
      phone,
      `${CATEGORY_LABELS[category]} selected! ✅\n\nLet's get the details right so your flyer looks professional. A few quick questions 👇`
    );
    return wa.sendText(phone, questions[0].prompt);
  }

  // Simple categories -- go straight to the original flow
  await sessionSvc.updateSession(session.id, { state: 'CATEGORY_SELECTED', category });
  await wa.sendText(
    phone,
    `${CATEGORY_LABELS[category]} selected! ✅\n\nWhat is the *name* of the person you are sending this to?\n\n_(e.g. Mama, Oga Tony, Chioma, Pastor Mike)_`
  );
}

async function handleStructuredAnswer(phone, session, message) {
  const category = session.category;
  const questions = STRUCTURED_QUESTIONS[category];
  const step = session.structured_step || 0;
  const currentQuestion = questions[step];

  const answer = message.text?.body?.trim();
  if (!answer || answer.length < 1) {
    return wa.sendText(phone, '⚠️ Please type an answer to continue.');
  }

  // Save this answer to its field, advance the step
  const nextStep = step + 1;
  await sessionSvc.updateSession(session.id, {
    [currentQuestion.field]: answer,
    structured_step: nextStep,
  });

  if (nextStep < questions.length) {
    // Ask the next question
    return wa.sendText(phone, questions[nextStep].prompt);
  }

  // All structured questions done -- offer optional photo upload
  await sessionSvc.updateSession(session.id, { state: 'AWAITING_PHOTO_DECISION' });
  return wa.sendButtons(
    phone,
    `✅ Got all the details!\n\nWant to *upload a photo* (your face, pastor's photo, candidate's photo, or business logo) to make it more personal? We'll feature it directly in the design.`,
    [
      { id: 'PHOTO_YES', title: '📸 Upload Photo' },
      { id: 'PHOTO_SKIP', title: '⏭️ Skip' },
    ]
  );
}

async function handlePhotoDecision(phone, session, message) {
  const btnId = message.interactive?.button_reply?.id;

  if (btnId === 'PHOTO_YES') {
    await sessionSvc.updateSession(session.id, { state: 'AWAITING_PHOTO_UPLOAD' });
    return wa.sendText(phone, '📸 Send the photo now as an image.');
  }

  if (btnId === 'PHOTO_SKIP') {
    return proceedToRecipientName(phone, session);
  }

  return wa.sendButtons(
    phone,
    'Please choose an option:',
    [
      { id: 'PHOTO_YES', title: '📸 Upload Photo' },
      { id: 'PHOTO_SKIP', title: '⏭️ Skip' },
    ]
  );
}

async function handlePhotoUpload(phone, session, message) {
  if (message.type !== 'image') {
    return wa.sendText(phone, '⚠️ Please send a photo as an image, or type *skip* to continue without one.');
  }

  await wa.sendText(phone, '⏳ Got your photo! Saving it...');
  try {
    const { buffer, mimeType } = await wa.downloadMedia(message.image.id);
    const fs = require('fs');
    const path = require('path');
    const { v4: uuidv4 } = require('uuid');

    const ext = mimeType.includes('png') ? 'png' : 'jpg';
    const filename = `upload_${uuidv4()}.${ext}`;
    const uploadDir = path.join(__dirname, '../../public/uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    const localPath = path.join(uploadDir, filename);
    fs.writeFileSync(localPath, buffer);

    const publicUrl = `${process.env.APP_URL}/uploads/${filename}`;

    await sessionSvc.updateSession(session.id, {
      photo_url: publicUrl,
      photo_local_path: localPath,
    });

    await wa.sendText(phone, '✅ Photo saved! It will be used in your design.');
    const freshSession = await sessionSvc.getSessionById(session.id);
    return proceedToRecipientName(phone, freshSession);
  } catch (err) {
    console.error('Photo upload error:', err.message);
    await wa.sendText(phone, '⚠️ Could not save that photo. Type *skip* to continue without one, or try sending it again.');
  }
}

async function proceedToRecipientName(phone, session) {
  await sessionSvc.updateSession(session.id, { state: 'CATEGORY_SELECTED' });
  const promptName =
    session.category === 'business_advert' || session.category === 'customer_appreciation'
      ? 'Who should we address this to? (your business name will already show, this is for a customer/recipient name if any)\n\n_(Type the name, or "none" if not applicable)_'
      : 'What is the *name* of the person this is for?\n\n_(e.g. Mama, Oga Tony, Chioma, Pastor Mike)_';
  return wa.sendText(phone, promptName);
}

async function handleRecipientName(phone, session, message) {
  const name = message.text?.body?.trim();
  if (!name || name.length < 1) {
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

  await sessionSvc.updateSession(session.id, { state: 'GENDER', gender });
  await wa.sendButtons(
    phone,
    `🎤 Now send a voice note and watch your meme unfold like magic! ✨\n\nTell us what you want to say -- we go turn am to something beautiful.\n\nOr type your message if you prefer.`,
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
    return wa.sendText(phone, '⌨️ Type your message now -- tell us what you want to say:');
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
  await wa.sendText(phone, '🎨 Payment confirmed! Creating your unique meme now...\n\n_This takes about 15-30 seconds ✨_');
  await sessionSvc.updateSession(session.id, { state: 'GENERATING' });

  try {
    const freshSession = await sessionSvc.getSessionById(session.id);

    // Generate caption and image prompt together -- pass the full session
    // so the structured fields (church name, venue, business name, etc.)
    // are available to the Category Intelligence Layer.
    const { caption, imagePrompt } = await generateCaptionAndImagePrompt(freshSession);

    // Generate image with GPT Image 2 -- uses the edits endpoint with the
    // uploaded photo as a reference if one was provided.
    const { publicUrl } = await imageSvc.generateMemeImage({
      imagePrompt,
      recipientName: freshSession.recipient_name,
      category: freshSession.category,
      photoLocalPath: freshSession.photo_local_path,
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
      `✅ Your meme don land! 🔥\n\nWant a *voice shoutout* to go with it? We go record the caption in a dramatic Nigerian accent -- send to ${freshSession.recipient_name} for extra effect! 🎤\n\n_Just ₦200 extra_`,
      [
        { id: 'SHOUTOUT_YES', title: '🎤 Yes! Add Shoutout' },
        { id: 'SHOUTOUT_NO', title: '✅ No, Am Good' },
      ]
    );
  } catch (err) {
    console.error('Generation error:', err.message);
    console.error('Generation error FULL DETAIL:', JSON.stringify(err.error || err.response?.data || err, Object.getOwnPropertyNames(err)));
    await sessionSvc.updateSession(session.id, { state: 'DONE' });
    await wa.sendText(phone, '❌ Something went wrong generating your meme. Type *menu* to try again. Your payment is saved.');
  }
}

async function handleShoutoutDecision(phone, session, message) {
  const btnId = message.interactive?.button_reply?.id;

  if (btnId === 'SHOUTOUT_YES') {
    await sessionSvc.updateSession(session.id, { state: 'DONE' });
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
