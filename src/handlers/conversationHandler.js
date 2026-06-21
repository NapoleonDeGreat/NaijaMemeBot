const wa = require('../services/whatsappService');
const sessionSvc = require('../services/sessionService');
const paymentSvc = require('../services/paymentService');
const { generateCaptionAndImagePrompt } = require('../services/gptService');
const imageSvc = require('../services/imageService');
const voiceSvc = require('../services/voiceService');
const pool = require('../db/pool');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

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
  CAT_birthday: 'birthday',
  CAT_naming_ceremony: 'naming_ceremony',
  CAT_wedding: 'wedding',
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
  birthday: '🎂 Birthday',
  naming_ceremony: '👶 Naming Ceremony',
  wedding: '💍 Wedding',
};

// Categories that go through the structured question flow before
// the voice-note step. The 5 personal/emotional categories
// (thank_you, apology, ask_money, congratulations, relationship)
// skip straight to the original simple flow (recipient name -> gender
// -> voice note), since they have no structured facts of their own.
const STRUCTURED_CATEGORIES = new Set([
  'church',
  'business_advert',
  'customer_appreciation',
  'political',
  'academic',
  'birthday',
  'naming_ceremony',
  'wedding',
]);

// Categories that already collect a subject name (celebrant, candidate,
// business, couple, etc.) via their structured questions, so the old
// generic "what's the recipient's name?" / "what gender?" tail is
// redundant and skipped entirely for these.
const SKIP_GENERIC_NAME_TAIL = new Set([
  'church',
  'business_advert',
  'customer_appreciation',
  'political',
  'academic',
  'birthday',
  'naming_ceremony',
  'wedding',
]);

// Ordered list of structured questions per category.
const STRUCTURED_QUESTIONS = {
  church: [
    { field: 'event_subtype', prompt: 'What *kind of church programme* is this?\n\n_(e.g. revival, bible study, prayer programme, crusade, family programme, convention, concert -- or describe it in your own words)_' },
    { field: 'church_name', prompt: 'What is the *name of the church*?' },
    { field: 'programme_title', prompt: 'What is the *programme title*?\n\n_(e.g. Revival Worship Experience)_' },
    { field: 'theme', prompt: 'What is the *theme* of the programme?\n\n_(e.g. A Call For Revival)_' },
    { field: 'event_date', prompt: 'What *date* is the programme?\n\n_(e.g. Sunday 1st March 2026)_' },
    { field: 'event_time', prompt: 'What *time* does it start?\n\n_(e.g. 2:30PM)_' },
    { field: 'venue', prompt: 'What is the *venue*?\n\n_(e.g. Chapel of Salvation, Nasarawa State University Keffi)_' },
    { field: 'guest_minister', prompt: 'Who is the *guest minister or speaker*?\n\n_(Type "none" if there isn\'t one)_' },
    { field: 'style_preference', prompt: 'Any *colour or style preference*?\n\n_(e.g. "gold and white", "keep it simple", or type "skip" and we\'ll pick something premium for you)_' },
  ],
  business_advert: [
    { field: 'event_subtype', prompt: 'What *kind of business promotion* is this?\n\n_(e.g. new product launch, discount/sale, restaurant, fashion, beauty, healthcare, school -- or describe it in your own words)_' },
    { field: 'business_name', prompt: 'What is the *name of your business*?' },
    { field: 'offer_product', prompt: 'What *product, service, or offer* are you advertising?' },
    { field: 'positioning', prompt: 'How would you describe your business?\n\n_(e.g. "luxury/premium", "affordable/budget", "mid-range" -- this helps us match the right look and feel)_' },
    { field: 'contact_info', prompt: 'What *contact info* should we show?\n\n_(you can list all of them -- phone, WhatsApp, TikTok, Instagram, address, etc.)_' },
    { field: 'style_preference', prompt: 'Any *colour or style preference*?\n\n_(e.g. "navy and gold, minimal", "bright and bold", or type "skip" and we\'ll pick something premium for you)_' },
  ],
  customer_appreciation: [
    { field: 'business_name', prompt: 'What is the *name of your business*?' },
    { field: 'offer_product', prompt: 'What is this customer being appreciated for?\n\n_(e.g. 1 year loyalty, referring new customers, 5-star review)_' },
    { field: 'positioning', prompt: 'How would you describe your business?\n\n_(e.g. "luxury/premium", "affordable/budget", "mid-range" -- this helps us match the right look and feel)_' },
    { field: 'contact_info', prompt: 'What *contact info* should we show?\n\n_(you can list all of them -- phone, WhatsApp, TikTok, Instagram, address, etc. -- or type "none" to skip)_' },
    { field: 'style_preference', prompt: 'Any *colour or style preference*?\n\n_(or type "skip" and we\'ll pick something premium for you)_' },
  ],
  political: [
    { field: 'event_subtype', prompt: 'What *kind of political design* is this?\n\n_(e.g. campaign poster, rally flyer, election promotion, community outreach -- or describe it in your own words)_' },
    { field: 'candidate_name', prompt: 'What is the *candidate\'s name*?' },
    { field: 'position_title', prompt: 'What *position* are they contesting for?\n\n_(e.g. Local Government Chairman)_' },
    { field: 'party_slogan', prompt: 'What is the *party name and/or campaign slogan*?' },
    { field: 'election_date', prompt: 'What is the *election date* or event date?' },
    { field: 'style_preference', prompt: 'Any *party colours or style preference*?\n\n_(or type "skip" and we\'ll pick something premium for you)_' },
  ],
  academic: [
    { field: 'school_name', prompt: 'What is the *name of the school/institution*?' },
    { field: 'achievement_name', prompt: 'What is the *achievement or event*?\n\n_(e.g. First Class Graduation, NYSC Call-Up, WAEC Result)_' },
    { field: 'achievement_date', prompt: 'What *date* should we show?' },
    { field: 'style_preference', prompt: 'Any *colour or style preference*?\n\n_(or type "skip" and we\'ll pick something premium for you)_' },
  ],
  birthday: [
    { field: 'celebrant_name', prompt: 'What is the *celebrant\'s name*?' },
    { field: 'celebration_date', prompt: 'What is the *birthday date*?' },
    { field: 'celebrant_relationship', prompt: 'What is your *relationship* to them?\n\n_(e.g. "my sister", "my boss", "my best friend")_' },
    { field: 'celebration_wish', prompt: 'Write a short *birthday wish or message* for them.' },
    { field: 'style_preference', prompt: 'Any *colour or style preference*?\n\n_(e.g. "pink and gold", "elegant and simple", or type "skip" and we\'ll pick something premium for you)_' },
  ],
  naming_ceremony: [
    { field: 'baby_name', prompt: 'What is the *baby\'s name*?' },
    { field: 'parents_names', prompt: 'What are the *parents\' names*?' },
    { field: 'naming_date', prompt: 'What is the *date* of the ceremony?' },
    { field: 'naming_venue', prompt: 'What is the *venue*?\n\n_(Type "none" if not yet decided)_' },
    { field: 'style_preference', prompt: 'Any *colour or style preference*?\n\n_(or type "skip" and we\'ll pick something premium for you)_' },
  ],
  wedding: [
    { field: 'bride_name', prompt: 'What is the *bride\'s name*?' },
    { field: 'groom_name', prompt: 'What is the *groom\'s name*?' },
    { field: 'wedding_date', prompt: 'What is the *wedding date*?' },
    { field: 'wedding_venue', prompt: 'What is the *venue*?\n\n_(Type "none" if not yet decided)_' },
    { field: 'style_preference', prompt: 'Any *colour or style preference*?\n\n_(e.g. "burgundy and gold", "soft pastels", or type "skip" and we\'ll pick something premium for you)_' },
  ],
};

// Photo roles per category -- each entry becomes one upload step asking
// specifically for that person/element's photo, rather than one generic
// "upload a photo" step. Categories not listed here get the old single
// generic optional photo step.
// Napoleon's own number -- bypasses payment entirely so he can test the
// real generation pipeline (real OpenAI calls, real quality) without
// needing to push money through Flutterwave every time. Same number
// already used as the escalation contact in routes/payment.js.
const ADMIN_PHONE = '2349067140564';

const PHOTO_ROLES = {
  birthday: [
    { role: 'celebrant_photo', label: "the celebrant's photo", required: false },
  ],
  naming_ceremony: [
    { role: 'baby_or_parents_photo', label: "a photo of the baby or parents", required: false },
  ],
  wedding: [
    { role: 'couple_photo', label: "a photo of the couple together (both bride and groom in one image)", required: false },
  ],
  church: [
    { role: 'host_photo', label: "the host/pastor's photo", required: false },
    { role: 'guest_minister_photo', label: "the guest minister's photo (if different from host)", required: false },
  ],
  political: [
    { role: 'candidate_photo', label: "the candidate's photo", required: false },
  ],
};

// Default single generic photo step for structured categories without
// a specific PHOTO_ROLES entry (business_advert, customer_appreciation,
// academic).
const DEFAULT_PHOTO_ROLE = [{ role: 'photo', label: 'your photo or business logo', required: false }];

function getPhotoRoles(category) {
  return PHOTO_ROLES[category] || DEFAULT_PHOTO_ROLE;
}

const LANGUAGE_OPTIONS = [
  { id: 'LANG_english', title: 'English' },
  { id: 'LANG_pidgin', title: 'Pidgin' },
  { id: 'LANG_yoruba', title: 'Yoruba' },
  { id: 'LANG_igbo', title: 'Igbo' },
  { id: 'LANG_hausa', title: 'Hausa' },
];

async function handleIncomingMessage(phone, message, messageId) {
  await wa.markRead(messageId);
  await sessionSvc.getOrCreateUser(phone);

  let session = await sessionSvc.getActiveSession(phone);
  const msgText = (message.text?.body || '').trim().toLowerCase();

  const GREETING_TRIGGERS = ['hi', 'hello', 'start', 'menu', 'restart', '0'];
  const isGreeting = GREETING_TRIGGERS.some(trigger => msgText === trigger || msgText.startsWith(trigger + ' '));

  if (isGreeting || !session) {
    session = await sessionSvc.createSession(phone);
    return sendMenu(phone);
  }

  switch (session.state) {
    case 'MENU': return handleMenuSelection(phone, session, message);
    case 'STRUCTURED_QA': return handleStructuredAnswer(phone, session, message);
    case 'AWAITING_PHOTO_DECISION': return handlePhotoDecision(phone, session, message);
    case 'AWAITING_PHOTO_UPLOAD': return handlePhotoUpload(phone, session, message);
    case 'AWAITING_LOGO_DECISION': return handleLogoDecision(phone, session, message);
    case 'AWAITING_LOGO_UPLOAD': return handleLogoUpload(phone, session, message);
    case 'AWAITING_PRODUCT_PHOTO_DECISION': return handleProductPhotoDecision(phone, session, message);
    case 'AWAITING_PRODUCT_PHOTO_UPLOAD': return handleProductPhotoUpload(phone, session, message);
    case 'AWAITING_OUTFIT_PREFERENCE': return handleOutfitPreference(phone, session, message);
    case 'CATEGORY_SELECTED': return handleRecipientName(phone, session, message);
    case 'RECIPIENT_NAME': return handleGender(phone, session, message);
    case 'AWAITING_LANGUAGE': return handleLanguageSelection(phone, session, message);
    case 'GENDER': return handleVoiceOrText(phone, session, message);
    case 'AWAITING_VOICE': return handleVoiceInput(phone, session, message);
    case 'AWAITING_PAYMENT': return handlePaymentCheck(phone, session, message);
    case 'AWAITING_SHOUTOUT': return handleShoutoutDecision(phone, session, message);
    case 'AWAITING_FEEDBACK_RATING': return handleFeedbackRating(phone, session, message);
    case 'AWAITING_FEEDBACK_COMMENT': return handleFeedbackComment(phone, session, message);
    default: return sendMenu(phone);
  }
}

async function sendMenu(phone) {
  // WhatsApp list messages cap at 10 rows total across all sections.
  // 13 categories no longer fit in one message, so this is split into
  // two sequential list messages instead.
  await wa.sendList(
    phone,
    '🎨 NaijaMeme Bot',
    'Welcome! What type of meme/flier do you want to create?\n\nPick a category below 👇 (more categories in the next message)',
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
        title: 'Celebrations',
        rows: [
          { id: 'CAT_birthday', title: '🎂 Birthday' },
          { id: 'CAT_naming_ceremony', title: '👶 Naming Ceremony' },
          { id: 'CAT_wedding', title: '💍 Wedding' },
        ],
      },
    ]
  );

  await wa.sendList(
    phone,
    '🎨 More Categories',
    'Business, church, and special categories 👇',
    'Choose Category',
    [
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

  // Simple personal categories -- go straight to the original flow
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

  const nextStep = step + 1;
  await sessionSvc.updateSession(session.id, {
    [currentQuestion.field]: answer,
    structured_step: nextStep,
  });

  if (nextStep < questions.length) {
    return wa.sendText(phone, questions[nextStep].prompt);
  }

  // All structured questions done -- start the photo-role flow
  return startPhotoFlow(phone, session.id);
}

async function startPhotoFlow(phone, sessionId) {
  const freshSession = await sessionSvc.getSessionById(sessionId);

  // business_advert gets its own flow: logo first, then a flexible
  // "add another product photo?" loop, since product counts vary
  // wildly (1 logo only vs a 6-item gallery) unlike fixed-role
  // categories like wedding (always couple) or church (host+guest).
  if (freshSession.category === 'business_advert') {
    await sessionSvc.updateSession(sessionId, { state: 'AWAITING_LOGO_DECISION' });
    return wa.sendButtons(
      phone,
      `✅ Got all the details!\n\nDo you have a *business logo* to upload? If you don't have one yet, we'll create a simple one for your design.`,
      [
        { id: 'LOGO_YES', title: '🖼️ Upload Logo' },
        { id: 'LOGO_SKIP', title: '✨ Create One For Me' },
      ]
    );
  }

  const roles = getPhotoRoles(freshSession.category);

  await sessionSvc.updateSession(sessionId, {
    state: 'AWAITING_PHOTO_DECISION',
    photo_role_step: 0,
  });

  const firstRole = roles[0];
  return wa.sendButtons(
    phone,
    `✅ Got all the details!\n\nWant to upload ${firstRole.label}? Real photos make the design look personal and premium. You can add more than one if needed.`,
    [
      { id: 'PHOTO_YES', title: '📸 Upload Photo' },
      { id: 'PHOTO_SKIP', title: '⏭️ Skip' },
    ]
  );
}

async function handleLogoDecision(phone, session, message) {
  const btnId = message.interactive?.button_reply?.id;

  if (btnId === 'LOGO_YES') {
    await sessionSvc.updateSession(session.id, { state: 'AWAITING_LOGO_UPLOAD' });
    return wa.sendText(phone, '🖼️ Send your business logo now as an image.');
  }

  if (btnId === 'LOGO_SKIP') {
    await sessionSvc.updateSession(session.id, { has_no_logo: true });
    return askForProductPhotos(phone, session.id, true);
  }

  return wa.sendButtons(
    phone,
    'Please choose an option:',
    [
      { id: 'LOGO_YES', title: '🖼️ Upload Logo' },
      { id: 'LOGO_SKIP', title: '✨ Create One For Me' },
    ]
  );
}

async function handleLogoUpload(phone, session, message) {
  if (message.type !== 'image') {
    return wa.sendText(phone, '⚠️ Please send your logo as an image, or type *skip* to let us create one.');
  }

  await wa.sendText(phone, '⏳ Got your logo! Saving it...');
  try {
    await saveUploadedPhoto(phone, session.id, message);
    await wa.sendText(phone, '✅ Logo saved!');
    return askForProductPhotos(phone, session.id, false);
  } catch (err) {
    console.error('Logo upload error:', err.message);
    return wa.sendText(phone, '⚠️ Could not save that logo. Type *skip* to continue, or try sending it again.');
  }
}

async function askForProductPhotos(phone, sessionId, isFirstAsk) {
  await sessionSvc.updateSession(sessionId, { state: 'AWAITING_PRODUCT_PHOTO_DECISION' });
  const prompt = isFirstAsk
    ? `No wahala! Now -- want to upload *product or shop photos*? You can add up to 6 to show off your range.`
    : `Want to add *another product photo*? You can add up to 6 total.`;
  return wa.sendButtons(
    phone,
    prompt,
    [
      { id: 'PRODUCT_PHOTO_YES', title: '📸 Add Photo' },
      { id: 'PRODUCT_PHOTO_DONE', title: '✅ Done Adding' },
    ]
  );
}

async function handleProductPhotoDecision(phone, session, message) {
  const btnId = message.interactive?.button_reply?.id;

  if (btnId === 'PRODUCT_PHOTO_YES') {
    let currentCount = 0;
    try {
      const urls = session.photo_urls ? JSON.parse(session.photo_urls) : [];
      currentCount = urls.length;
    } catch {
      currentCount = 0;
    }
    if (currentCount >= 6) {
      await wa.sendText(phone, "That's 6 photos already, the max for one design! Moving on...");
      return proceedPastPhotos(phone, session.id);
    }
    await sessionSvc.updateSession(session.id, { state: 'AWAITING_PRODUCT_PHOTO_UPLOAD' });
    return wa.sendText(phone, '📸 Send the product/shop photo now as an image.');
  }

  if (btnId === 'PRODUCT_PHOTO_DONE') {
    return proceedPastPhotos(phone, session.id);
  }

  return wa.sendButtons(
    phone,
    'Please choose an option:',
    [
      { id: 'PRODUCT_PHOTO_YES', title: '📸 Add Photo' },
      { id: 'PRODUCT_PHOTO_DONE', title: '✅ Done Adding' },
    ]
  );
}

async function handleProductPhotoUpload(phone, session, message) {
  if (message.type !== 'image') {
    return wa.sendText(phone, '⚠️ Please send a photo as an image, or type *skip* to move on.');
  }

  await wa.sendText(phone, '⏳ Got it! Saving...');
  try {
    await saveUploadedPhoto(phone, session.id, message);
    await wa.sendText(phone, '✅ Photo saved!');
    const freshSession = await sessionSvc.getSessionById(session.id);
    return askForProductPhotos(phone, session.id, false);
  } catch (err) {
    console.error('Product photo upload error:', err.message);
    return wa.sendText(phone, '⚠️ Could not save that photo. Try sending it again, or type *skip*.');
  }
}

// Shared upload-and-store logic used by both the logo upload and the
// product photo loop, so the file-handling code isn't duplicated.
async function saveUploadedPhoto(phone, sessionId, message) {
  const { buffer, mimeType } = await wa.downloadMedia(message.image.id);

  const ext = mimeType.includes('png') ? 'png' : 'jpg';
  const filename = `upload_${uuidv4()}.${ext}`;
  const uploadDir = path.join(__dirname, '../../public/uploads');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  const localPath = path.join(uploadDir, filename);
  fs.writeFileSync(localPath, buffer);

  const baseUrl = (process.env.APP_URL || '').replace(/\/+$/, '');
  const publicUrl = `${baseUrl}/uploads/${filename}`;

  const freshSession = await sessionSvc.getSessionById(sessionId);
  let urls = [];
  let localPaths = [];
  try { urls = freshSession.photo_urls ? JSON.parse(freshSession.photo_urls) : []; } catch { urls = []; }
  try { localPaths = freshSession.photo_local_paths ? JSON.parse(freshSession.photo_local_paths) : []; } catch { localPaths = []; }

  urls.push(publicUrl);
  localPaths.push(localPath);

  await sessionSvc.updateSession(sessionId, {
    photo_urls: JSON.stringify(urls),
    photo_local_paths: JSON.stringify(localPaths),
    photo_upload_count: urls.length,
  });
}

async function handlePhotoDecision(phone, session, message) {
  const btnId = message.interactive?.button_reply?.id;
  const roles = getPhotoRoles(session.category);
  const roleStep = session.photo_role_step || 0;
  const currentRole = roles[roleStep];

  if (btnId === 'PHOTO_YES') {
    await sessionSvc.updateSession(session.id, { state: 'AWAITING_PHOTO_UPLOAD' });
    return wa.sendText(phone, `📸 Send ${currentRole.label} now as an image.`);
  }

  if (btnId === 'PHOTO_SKIP') {
    return advancePhotoRoleOrContinue(phone, session.id, roleStep);
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

    const ext = mimeType.includes('png') ? 'png' : 'jpg';
    const filename = `upload_${uuidv4()}.${ext}`;
    const uploadDir = path.join(__dirname, '../../public/uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    const localPath = path.join(uploadDir, filename);
    fs.writeFileSync(localPath, buffer);

    const baseUrl = (process.env.APP_URL || '').replace(/\/+$/, '');
    const publicUrl = `${baseUrl}/uploads/${filename}`;

    // Append to the existing photo arrays rather than overwriting
    const freshSession = await sessionSvc.getSessionById(session.id);
    let urls = [];
    let localPaths = [];
    try { urls = freshSession.photo_urls ? JSON.parse(freshSession.photo_urls) : []; } catch { urls = []; }
    try { localPaths = freshSession.photo_local_paths ? JSON.parse(freshSession.photo_local_paths) : []; } catch { localPaths = []; }

    urls.push(publicUrl);
    localPaths.push(localPath);

    await sessionSvc.updateSession(session.id, {
      photo_urls: JSON.stringify(urls),
      photo_local_paths: JSON.stringify(localPaths),
      photo_upload_count: urls.length,
    });

    await wa.sendText(phone, '✅ Photo saved!');

    const roleStep = freshSession.photo_role_step || 0;
    return advancePhotoRoleOrContinue(phone, session.id, roleStep);
  } catch (err) {
    console.error('Photo upload error:', err.message);
    await wa.sendText(phone, '⚠️ Could not save that photo. Type *skip* to continue without one, or try sending it again.');
  }
}

async function advancePhotoRoleOrContinue(phone, sessionId, completedRoleStep) {
  const freshSession = await sessionSvc.getSessionById(sessionId);
  const roles = getPhotoRoles(freshSession.category);
  const nextRoleStep = completedRoleStep + 1;

  if (nextRoleStep < roles.length) {
    await sessionSvc.updateSession(sessionId, {
      state: 'AWAITING_PHOTO_DECISION',
      photo_role_step: nextRoleStep,
    });
    const nextRole = roles[nextRoleStep];
    return wa.sendButtons(
      phone,
      `Want to upload ${nextRole.label}?`,
      [
        { id: 'PHOTO_YES', title: '📸 Upload Photo' },
        { id: 'PHOTO_SKIP', title: '⏭️ Skip' },
      ]
    );
  }

  // All photo roles for this category have been offered -- move on
  return proceedPastPhotos(phone, sessionId);
}

// Categories where the photo roles are of actual people (not just a
// business logo) -- these are the ones where "keep outfit vs upgrade
// clothing" is a meaningful question. business_advert/customer_appreciation
// default photo role is often a logo, so we skip asking there unless a
// photo was genuinely uploaded.
const PERSON_PHOTO_CATEGORIES = new Set([
  'birthday', 'wedding', 'church', 'political', 'naming_ceremony',
  'business_advert', 'customer_appreciation', 'academic',
]);

async function proceedPastPhotos(phone, sessionId) {
  const freshSession = await sessionSvc.getSessionById(sessionId);

  let photoCount = 0;
  try {
    const urls = freshSession.photo_urls ? JSON.parse(freshSession.photo_urls) : [];
    photoCount = urls.length;
  } catch {
    photoCount = 0;
  }

  // If at least one real photo was uploaded for a person-photo category,
  // ask once whether to keep the exact outfit or upgrade it for the design.
  if (photoCount > 0 && PERSON_PHOTO_CATEGORIES.has(freshSession.category) && !freshSession.outfit_preference) {
    await sessionSvc.updateSession(sessionId, { state: 'AWAITING_OUTFIT_PREFERENCE' });
    return wa.sendButtons(
      phone,
      `📸 Got the photo(s)! One more thing -- for the design, should we *keep the exact outfit* from your photo, or *upgrade it* to suit the flyer style?`,
      [
        { id: 'OUTFIT_KEEP', title: '👕 Keep Outfit' },
        { id: 'OUTFIT_UPGRADE', title: '✨ Upgrade Outfit' },
      ]
    );
  }

  if (SKIP_GENERIC_NAME_TAIL.has(freshSession.category)) {
    // This category already collected its own subject name(s) via
    // structured questions -- skip straight to language choice + voice note.
    return askLanguage(phone, sessionId);
  }

  // Shouldn't normally happen (structured categories all skip the tail),
  // but fall back safely just in case.
  await sessionSvc.updateSession(sessionId, { state: 'CATEGORY_SELECTED' });
  return wa.sendText(phone, 'What is the *name* of the person this is for?');
}

async function handleOutfitPreference(phone, session, message) {
  const btnId = message.interactive?.button_reply?.id;
  const preference = btnId === 'OUTFIT_KEEP' ? 'keep outfits' : btnId === 'OUTFIT_UPGRADE' ? 'upgrade to suit flyer style' : null;

  if (!preference) {
    return wa.sendButtons(
      phone,
      'Please choose an option:',
      [
        { id: 'OUTFIT_KEEP', title: '👕 Keep Outfit' },
        { id: 'OUTFIT_UPGRADE', title: '✨ Upgrade Outfit' },
      ]
    );
  }

  await sessionSvc.updateSession(session.id, { outfit_preference: preference });

  if (SKIP_GENERIC_NAME_TAIL.has(session.category)) {
    return askLanguage(phone, session.id);
  }

  await sessionSvc.updateSession(session.id, { state: 'CATEGORY_SELECTED' });
  return wa.sendText(phone, 'What is the *name* of the person this is for?');
}

async function askLanguage(phone, sessionId) {
  await sessionSvc.updateSession(sessionId, { state: 'AWAITING_LANGUAGE' });
  return wa.sendList(
    phone,
    '🎤 Voice Note Language',
    'What language will you record your voice note in? This helps us transcribe it accurately.',
    'Choose Language',
    [
      {
        title: 'Languages',
        rows: LANGUAGE_OPTIONS,
      },
    ]
  );
}

async function handleLanguageSelection(phone, session, message) {
  const selected = message.interactive?.list_reply?.id;
  const langMap = {
    LANG_english: 'english',
    LANG_pidgin: 'pidgin',
    LANG_yoruba: 'yoruba',
    LANG_igbo: 'igbo',
    LANG_hausa: 'hausa',
  };
  const voiceLanguage = langMap[selected];

  if (!voiceLanguage) {
    return wa.sendList(
      phone,
      '🎤 Voice Note Language',
      'Please choose a language from the list:',
      'Choose Language',
      [{ title: 'Languages', rows: LANGUAGE_OPTIONS }]
    );
  }

  await sessionSvc.updateSession(session.id, { voice_language: voiceLanguage, state: 'AWAITING_VOICE' });
  await wa.sendButtons(
    phone,
    `🎤 Now send a voice note and watch your meme unfold like magic! ✨\n\nTell us what you want to say -- we go turn am to something beautiful.\n\nOr type your message if you prefer.`,
    [
      { id: 'TYPE_MESSAGE', title: '⌨️ Type Instead' },
    ]
  );
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

  await sessionSvc.updateSession(session.id, { gender });
  return askLanguage(phone, session.id);
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
      const transcript = await voiceSvc.transcribeVoiceNote(buffer, mimeType, session.voice_language);
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
  // Admin bypass -- skip the Flutterwave payment gate entirely so the
  // owner can test the real generation pipeline (real OpenAI calls,
  // real output quality) without paying himself every time.
  const normalizedPhone = phone.replace(/[^0-9]/g, '');
  if (normalizedPhone === ADMIN_PHONE) {
    await wa.sendText(phone, '🔓 Admin mode -- skipping payment. Generating now...');
    return generateAndSend(phone, session);
  }

  try {
    const { paymentUrl, reference, amount } = await paymentSvc.initializePayment({
      phone,
      sessionId: session.id,
      category: session.category,
    });

    await sessionSvc.updateSession(session.id, {
      state: 'AWAITING_PAYMENT',
      payment_ref: reference,
    });

    await wa.sendText(
      phone,
      `💳 *Almost there!*\n\nPay *₦${amount}* to unlock your meme:\n\n${paymentUrl}\n\n_After payment, type *done* to confirm._`
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

  return generateAndSend(phone, session, message.id);
}

async function generateAndSend(phone, session, triggeringMessageId) {
  // Real WhatsApp typing indicator, shown via the markRead call against
  // the message that triggered generation (e.g. user typing "done").
  // Only available when called from a live WhatsApp message -- the
  // payment webhook/callback routes call this without a message ID
  // (server-to-server, no inbound message to attach the indicator to),
  // so this is skipped gracefully in that case.
  if (triggeringMessageId) {
    await wa.markRead(triggeringMessageId, true);
  }
  await wa.sendText(phone, '🎨 Payment confirmed! Creating your unique meme now...\n\n_This usually takes 1-3 minutes for premium quality ✨_');
  await sessionSvc.updateSession(session.id, { state: 'GENERATING' });

  try {
    const freshSession = await sessionSvc.getSessionById(session.id);

    const { caption, imagePrompt } = await generateCaptionAndImagePrompt(freshSession);

    let photoLocalPaths = [];
    try {
      photoLocalPaths = freshSession.photo_local_paths ? JSON.parse(freshSession.photo_local_paths) : [];
    } catch {
      photoLocalPaths = [];
    }

    const { publicUrl, localPath: generatedLocalPath } = await imageSvc.generateMemeImage({
      imagePrompt,
      recipientName: freshSession.recipient_name,
      category: freshSession.category,
      photoLocalPaths,
    });

    await pool.query(
      `INSERT INTO generated_images (session_id, phone, caption, recipient_name, image_path)
       VALUES ($1, $2, $3, $4, $5)`,
      [session.id, phone, caption, freshSession.recipient_name, publicUrl]
    );

    await wa.sendImage(phone, publicUrl, caption);

    // Warm, genuinely personal closing message -- speaks to what the
    // person just created and why it matters, not generic "thank you
    // for using our bot" corporate gratitude.
    const thankYouMessages = {
      birthday: `🎂 *${freshSession.celebrant_name || freshSession.recipient_name}* go smile well well when dem see this -- you don show say you care. That na the real gift sometimes, not the card, na the thought wey dey behind am. Enjoy the celebration! 🙏✨`,
      wedding: `💍 Una don create something beautiful to mark this love story. Years from now, una go still dey look back on this moment. We honoured say you choose us to be part of am 🙏✨`,
      naming_ceremony: `👶 A new name, a new life, a new beginning -- and you don capture am beautifully. God bless this child and everyone wey go gather to celebrate am 🙏`,
      church: `⛪ This na more than a flyer -- na an invitation for people to encounter God. We pray say many souls go answer this call and your ministry go grow more more 🙏🔥`,
      business_advert: `📢 Your business just got a piece wey go make people stop and look. Every great brand started small -- this na one more step toward the business you dey build. We dey root for you 💪🙏`,
      customer_appreciation: `⭐ The customer wey go see this go feel am for their heart. Loyalty no dey cheap -- and the fact say you took time to celebrate them go mean everything. Na people like you dey build real businesses 🙏`,
      political: `🗳️ Leadership start with people seeing your vision clearly -- and now they fit see am. We dey hope say this go carry your message far and touch the hearts wey need to hear am 🙏`,
      academic: `🎓 All the late nights, the hard work, the sacrifice -- e don pay off, and now the world fit see am too. This moment na yours, celebrate am well 🙏✨`,
      thank_you: `🙏 Sometimes the people wey deserve appreciation no dey hear am enough. You just made sure that wasn't the case today. That kindness go reach them well 💚`,
      congratulations: `🎉 Every win deserve to be celebrated loud -- and now it is. May this just be the beginning of many more testimonies for them 💚`,
      apology: `😔 It take courage to say sorry well. Whatever happen, we hope say this opens the door for healing and understanding. Things fit still work out 🙏`,
      ask_money: `💸 Asking for help no easy, but you don put am out there in a way wey go land soft. We dey hope say everything works out for you 😄🙏`,
      relationship: `💔 You don shoot your shot -- and that already take guts. Whatever happens next, at least they go know exactly how you feel. We dey root for you 🎯😄`,
    };
    const thankYou = thankYouMessages[freshSession.category] || `🙏 We're genuinely glad we could help bring this to life for you. Every design we make is for a real moment in someone's life -- thank you for letting this be one of them.`;
    await wa.sendText(phone, thankYou);

    await sessionSvc.updateSession(session.id, {
      state: 'AWAITING_SHOUTOUT',
      generated_image_url: publicUrl,
      generated_image_local_path: generatedLocalPath,
    });

    await pool.query(
      'UPDATE users SET total_orders = total_orders + 1, updated_at = NOW() WHERE phone = $1',
      [phone]
    );

    await wa.sendButtons(
      phone,
      `✅ Your meme don land! 🔥\n\nWant a *voice shoutout* to go with it? We go record the caption in a dramatic Nigerian accent! 🎤\n\n_Just ₦200 extra_`,
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
    await wa.sendText(phone, '🎤 Shoutout feature coming very soon! Watch this space 🔥');
    return askForFeedback(phone, session.id);
  } else if (btnId === 'SHOUTOUT_NO') {
    await wa.sendText(phone, `🔥 Your meme don ready! Save am and share!`);
    return askForFeedback(phone, session.id);
  }
}

async function askForFeedback(phone, sessionId) {
  await sessionSvc.updateSession(sessionId, { state: 'AWAITING_FEEDBACK_RATING' });
  return wa.sendList(
    phone,
    '💬 Quick Feedback',
    'Before you go -- how was your experience today? Your honest rating helps us improve 🙏',
    'Rate Us',
    [
      {
        title: 'Your Rating',
        rows: [
          { id: 'RATING_5', title: '⭐⭐⭐⭐⭐ Excellent' },
          { id: 'RATING_4', title: '⭐⭐⭐⭐ Good' },
          { id: 'RATING_3', title: '⭐⭐⭐ Okay' },
          { id: 'RATING_2', title: '⭐⭐ Not Great' },
          { id: 'RATING_1', title: '⭐ Poor' },
        ],
      },
    ]
  );
}

async function handleFeedbackRating(phone, session, message) {
  const selected = message.interactive?.list_reply?.id;
  const ratingMap = { RATING_5: 5, RATING_4: 4, RATING_3: 3, RATING_2: 2, RATING_1: 1 };
  const rating = ratingMap[selected];

  if (!rating) {
    return wa.sendList(
      phone,
      '💬 Quick Feedback',
      'Please pick a rating from the list:',
      'Rate Us',
      [
        {
          title: 'Your Rating',
          rows: [
            { id: 'RATING_5', title: '⭐⭐⭐⭐⭐ Excellent' },
            { id: 'RATING_4', title: '⭐⭐⭐⭐ Good' },
            { id: 'RATING_3', title: '⭐⭐⭐ Okay' },
            { id: 'RATING_2', title: '⭐⭐ Not Great' },
            { id: 'RATING_1', title: '⭐ Poor' },
          ],
        },
      ]
    );
  }

  await sessionSvc.updateSession(session.id, { feedback_rating: rating, state: 'AWAITING_FEEDBACK_COMMENT' });

  const followUp = rating <= 3
    ? `Thanks for the honesty 🙏 What could we have done better? Type your thoughts, or type *skip*.`
    : `🙌 We're glad you enjoyed it! Any suggestions or comments? Type them now, or type *skip*.`;

  return wa.sendText(phone, followUp);
}

async function handleFeedbackComment(phone, session, message) {
  const typed = (message.text?.body || '').trim();
  const comment = (typed.toLowerCase() === 'skip' || typed.length === 0) ? null : typed;

  await sessionSvc.updateSession(session.id, { state: 'DONE' });

  await pool.query(
    `INSERT INTO feedback (session_id, phone, category, rating, comment)
     VALUES ($1, $2, $3, $4, $5)`,
    [session.id, phone, session.category, session.feedback_rating, comment]
  );

  // Forward low ratings or any comment to the admin immediately, so
  // real complaints/suggestions don't sit unseen in the database.
  // Uses the same digits-only format as the proven escalateToAdmin
  // pattern in routes/payment.js, rather than guessing at a different
  // format that might not actually deliver.
  if (session.feedback_rating <= 3 || comment) {
    const stars = '⭐'.repeat(session.feedback_rating);
    const alertMsg = `📋 *New Feedback*\n\nFrom: ${phone}\nCategory: ${session.category}\nRating: ${stars} (${session.feedback_rating}/5)\n${comment ? `Comment: "${comment}"` : 'No comment left'}`;
    await wa.sendText(ADMIN_PHONE, alertMsg);
  }

  await wa.sendButtons(
    phone,
    `🙏 Thank you for your feedback! It genuinely helps us get better.\n\nWant to create another design?`,
    [{ id: 'RESTART', title: '🔄 Create Another' }]
  );
}

module.exports = { handleIncomingMessage, generateAndSend };
