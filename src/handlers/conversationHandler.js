const wa = require('../services/whatsappService');
const sessionSvc = require('../services/sessionService');
const paymentSvc = require('../services/paymentService');
const { generateCaptionAndImagePrompt } = require('../services/gptService');
const imageSvc = require('../services/imageService');
const voiceSvc = require('../services/voiceService');
const musicSvc = require('../services/musicService');
const { buildMusicPrompt, isPremiumLanguage } = require('../services/promptBuilderService');
const pool = require('../db/pool');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const ADMIN_PHONE = '2349067140564';

// ══════════════════════════════════════════════════════
// FLYER CATEGORIES
// ══════════════════════════════════════════════════════

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

const STRUCTURED_CATEGORIES = new Set([
  'church', 'business_advert', 'customer_appreciation',
  'political', 'academic', 'birthday', 'naming_ceremony', 'wedding',
]);

const SKIP_GENERIC_NAME_TAIL = new Set([
  'church', 'business_advert', 'customer_appreciation',
  'political', 'academic', 'birthday', 'naming_ceremony', 'wedding',
]);

const STRUCTURED_QUESTIONS = {
  church: [
    { field: 'event_subtype', prompt: 'What *kind of church programme* is this?\n\n_(e.g. revival, bible study, prayer programme, crusade, family programme, convention, concert)_' },
    { field: 'church_name', prompt: 'What is the *name of the church*?' },
    { field: 'programme_title', prompt: 'What is the *programme title*?\n\n_(e.g. Revival Worship Experience)_' },
    { field: 'theme', prompt: 'What is the *theme* of the programme?\n\n_(e.g. A Call For Revival)_' },
    { field: 'event_date', prompt: 'What *date* is the programme?\n\n_(e.g. Sunday 1st March 2026)_' },
    { field: 'event_time', prompt: 'What *time* does it start?\n\n_(e.g. 2:30PM)_' },
    { field: 'venue', prompt: 'What is the *venue*?' },
    { field: 'guest_minister', prompt: 'Who is the *guest minister or speaker*?\n\n_(Type "none" if there is not one)_' },
    { field: 'style_preference', prompt: 'Any *colour or style preference*?\n\n_(or type "skip")_' },
  ],
  business_advert: [
    { field: 'event_subtype', prompt: 'What *kind of business promotion* is this?\n\n_(e.g. new product launch, discount/sale, restaurant, fashion, beauty, healthcare, school)_' },
    { field: 'business_name', prompt: 'What is the *name of your business*?' },
    { field: 'offer_product', prompt: 'What *product, service, or offer* are you advertising?' },
    { field: 'positioning', prompt: 'How would you describe your business?\n\n_(e.g. luxury/premium, affordable/budget, mid-range)_' },
    { field: 'contact_info', prompt: 'What *contact info* should we show?\n\n_(phone, WhatsApp, TikTok, Instagram, address, etc.)_' },
    { field: 'style_preference', prompt: 'Any *colour or style preference*?\n\n_(or type "skip")_' },
  ],
  customer_appreciation: [
    { field: 'business_name', prompt: 'What is the *name of your business*?' },
    { field: 'offer_product', prompt: 'What is this customer being appreciated for?' },
    { field: 'positioning', prompt: 'How would you describe your business?\n\n_(e.g. luxury/premium, affordable/budget, mid-range)_' },
    { field: 'contact_info', prompt: 'What *contact info* should we show?\n\n_(or type "none" to skip)_' },
    { field: 'style_preference', prompt: 'Any *colour or style preference*?\n\n_(or type "skip")_' },
  ],
  political: [
    { field: 'event_subtype', prompt: 'What *kind of political design* is this?\n\n_(e.g. campaign poster, rally flyer, election promotion, community outreach)_' },
    { field: 'candidate_name', prompt: 'What is the *candidate\'s name*?' },
    { field: 'position_title', prompt: 'What *position* are they contesting for?' },
    { field: 'party_slogan', prompt: 'What is the *party name and/or campaign slogan*?' },
    { field: 'election_date', prompt: 'What is the *election date* or event date?' },
    { field: 'style_preference', prompt: 'Any *party colours or style preference*?\n\n_(or type "skip")_' },
  ],
  academic: [
    { field: 'school_name', prompt: 'What is the *name of the school/institution*?' },
    { field: 'achievement_name', prompt: 'What is the *achievement or event*?\n\n_(e.g. First Class Graduation, NYSC Call-Up, WAEC Result)_' },
    { field: 'achievement_date', prompt: 'What *date* should we show?' },
    { field: 'style_preference', prompt: 'Any *colour or style preference*?\n\n_(or type "skip")_' },
  ],
  birthday: [
    { field: 'celebrant_name', prompt: 'What is the *celebrant\'s name*?' },
    { field: 'celebration_date', prompt: 'What is the *birthday date*?' },
    { field: 'celebrant_relationship', prompt: 'What is your *relationship* to them?' },
    { field: 'celebration_wish', prompt: 'Write a short *birthday wish or message* for them.' },
    { field: 'style_preference', prompt: 'Any *colour or style preference*?\n\n_(or type "skip")_' },
  ],
  naming_ceremony: [
    { field: 'baby_name', prompt: 'What is the *baby\'s name*?' },
    { field: 'parents_names', prompt: 'What are the *parents\' names*?' },
    { field: 'naming_date', prompt: 'What is the *date* of the ceremony?' },
    { field: 'naming_venue', prompt: 'What is the *venue*?\n\n_(Type "none" if not yet decided)_' },
    { field: 'style_preference', prompt: 'Any *colour or style preference*?\n\n_(or type "skip")_' },
  ],
  wedding: [
    { field: 'bride_name', prompt: 'What is the *bride\'s name*?' },
    { field: 'groom_name', prompt: 'What is the *groom\'s name*?' },
    { field: 'wedding_date', prompt: 'What is the *wedding date*?' },
    { field: 'wedding_venue', prompt: 'What is the *venue*?\n\n_(Type "none" if not yet decided)_' },
    { field: 'style_preference', prompt: 'Any *colour or style preference*?\n\n_(or type "skip")_' },
  ],
};

const PHOTO_ROLES = {
  birthday: [{ role: 'celebrant_photo', label: "the celebrant's photo", required: false }],
  naming_ceremony: [{ role: 'baby_or_parents_photo', label: "a photo of the baby or parents", required: false }],
  wedding: [{ role: 'couple_photo', label: "a photo of the couple together", required: false }],
  church: [
    { role: 'host_photo', label: "the host/pastor's photo", required: false },
    { role: 'guest_minister_photo', label: "the guest minister's photo", required: false },
  ],
  political: [{ role: 'candidate_photo', label: "the candidate's photo", required: false }],
};

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

const PERSON_PHOTO_CATEGORIES = new Set([
  'birthday', 'wedding', 'church', 'political', 'naming_ceremony',
  'business_advert', 'customer_appreciation', 'academic',
]);

// ══════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ══════════════════════════════════════════════════════

async function handleIncomingMessage(phone, message, messageId) {
  await wa.markRead(messageId);
  await sessionSvc.getOrCreateUser(phone);

  let session = await sessionSvc.getActiveSession(phone);
  const msgText = (message.text?.body || '').trim().toLowerCase();

  const GREETING_TRIGGERS = ['hi', 'hello', 'start', 'menu', 'restart', '0'];
  const isGreeting = GREETING_TRIGGERS.some(t => msgText === t || msgText.startsWith(t + ' '));

  if (isGreeting || !session) {
    session = await sessionSvc.createSession(phone);
    return sendMainMenu(phone);
  }

  switch (session.state) {
    case 'MAIN_MENU': return handleMainMenuSelection(phone, session, message);
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
    // Music states
    case 'MUSIC_CATEGORY': return handleMusicCategory(phone, session, message);
    case 'MUSIC_GENRE': return handleMusicGenre(phone, session, message);
    case 'MUSIC_PERSON_NAME': return handleMusicPersonName(phone, session, message);
    case 'MUSIC_LANGUAGE': return handleMusicLanguage(phone, session, message);
    case 'MUSIC_STORY': return handleMusicStory(phone, session, message);
    case 'MUSIC_LYRICS_CONFIRM': return handleLyricsConfirm(phone, session, message);
    case 'MUSIC_LYRICS_EDIT': return handleLyricsEdit(phone, session, message);
    case 'MUSIC_AWAITING_PAYMENT': return handleMusicPaymentCheck(phone, session, message);
    // Shared
    case 'AWAITING_FEEDBACK_RATING': return handleFeedbackRating(phone, session, message);
    case 'AWAITING_FEEDBACK_COMMENT': return handleFeedbackComment(phone, session, message);
    default: return sendMainMenu(phone);
  }
}

// ══════════════════════════════════════════════════════
// MAIN MENU
// ══════════════════════════════════════════════════════

async function sendMainMenu(phone) {
  return wa.sendList(
    phone,
    '🎨🎵 NaijaMeme Studio',
    'Welcome! Na wetin you wan create today?\n\nPick one option below 👇',
    'Choose',
    [
      {
        title: 'What do you want to create?',
        rows: [
          { id: 'MAIN_FLYER', title: '🖼️ Create a Flyer' },
          { id: 'MAIN_SONG', title: '🎵 Create a Song' },
          { id: 'MAIN_BUNDLE', title: '🎁 Flyer + Song Bundle' },
        ],
      },
    ]
  );
}

async function handleMainMenuSelection(phone, session, message) {
  const selected = message.interactive?.list_reply?.id;

  if (selected === 'MAIN_FLYER') {
    await sessionSvc.updateSession(session.id, { state: 'MENU', mode: 'flyer' });
    return sendMenu(phone);
  }

  if (selected === 'MAIN_SONG') {
    await sessionSvc.updateSession(session.id, { state: 'MUSIC_CATEGORY', mode: 'song' });
    return sendMusicCategoryMenu(phone);
  }

  if (selected === 'MAIN_BUNDLE') {
    await sessionSvc.updateSession(session.id, { state: 'MUSIC_CATEGORY', mode: 'bundle' });
    await wa.sendText(phone, '🎁 *Flyer + Song Bundle* selected! ₦2,000 for both 🔥\n\nLet\'s start with your song 🎵');
    return sendMusicCategoryMenu(phone);
  }

  return sendMainMenu(phone);
}

// ══════════════════════════════════════════════════════
// FLYER FLOW — unchanged
// ══════════════════════════════════════════════════════

async function sendMenu(phone) {
  await wa.sendList(
    phone,
    '🎨 NaijaMeme Bot',
    'What type of flyer do you want?\n\nPick a category below 👇',
    'Choose Category',
    [
      {
        title: 'Personal Messages',
        rows: [
          { id: 'CAT_thank_you', title: '🙏 Thank You' },
          { id: 'CAT_apology', title: '😔 Apology' },
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
    'Business, church & special 👇',
    'Choose Category',
    [
      {
        title: 'Business & Special',
        rows: [
          { id: 'CAT_customer_appreciation', title: '⭐ Appreciation' },
          { id: 'CAT_business_advert', title: '📢 Business Advert' },
          { id: 'CAT_church', title: '⛪ Church/Ministry' },
          { id: 'CAT_political', title: '🗳️ Political' },
          { id: 'CAT_academic', title: '🎓 Academic' },
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
    await wa.sendText(phone, `${CATEGORY_LABELS[category]} selected! ✅\n\nA few quick questions to make your flyer look professional 👇`);
    return wa.sendText(phone, questions[0].prompt);
  }

  await sessionSvc.updateSession(session.id, { state: 'CATEGORY_SELECTED', category });
  await wa.sendText(phone, `${CATEGORY_LABELS[category]} selected! ✅\n\nWhat is the *name* of the person you are sending this to?`);
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

  return startPhotoFlow(phone, session.id);
}

async function startPhotoFlow(phone, sessionId) {
  const freshSession = await sessionSvc.getSessionById(sessionId);

  if (freshSession.category === 'business_advert') {
    await sessionSvc.updateSession(sessionId, { state: 'AWAITING_LOGO_DECISION' });
    return wa.sendButtons(
      phone,
      '✅ Got all the details!\n\nDo you have a *business logo* to upload?',
      [
        { id: 'LOGO_YES', title: '🖼️ Upload Logo' },
        { id: 'LOGO_SKIP', title: '✨ Create One For Me' },
      ]
    );
  }

  const roles = getPhotoRoles(freshSession.category);
  await sessionSvc.updateSession(sessionId, { state: 'AWAITING_PHOTO_DECISION', photo_role_step: 0 });

  const firstRole = roles[0];
  return wa.sendButtons(
    phone,
    `✅ Got all the details!\n\nWant to upload ${firstRole.label}? Real photos make designs look personal and premium.`,
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
  return wa.sendButtons(phone, 'Please choose an option:', [
    { id: 'LOGO_YES', title: '🖼️ Upload Logo' },
    { id: 'LOGO_SKIP', title: '✨ Create One For Me' },
  ]);
}

async function handleLogoUpload(phone, session, message) {
  if (message.type !== 'image') {
    return wa.sendText(phone, '⚠️ Please send your logo as an image.');
  }
  await wa.sendText(phone, '⏳ Got your logo! Saving it...');
  try {
    await saveUploadedPhoto(phone, session.id, message, 'logo');
    await wa.sendText(phone, '✅ Logo saved!');
    return askForProductPhotos(phone, session.id, false);
  } catch (err) {
    console.error('Logo upload error:', err.message);
    return wa.sendText(phone, '⚠️ Could not save that logo. Type *skip* to continue.');
  }
}

async function askForProductPhotos(phone, sessionId, isFirstAsk) {
  await sessionSvc.updateSession(sessionId, { state: 'AWAITING_PRODUCT_PHOTO_DECISION' });
  const prompt = isFirstAsk
    ? 'No wahala! Want to upload *product or shop photos*? You can add up to 6.'
    : 'Want to add *another product photo*? Up to 6 total.';
  return wa.sendButtons(phone, prompt, [
    { id: 'PRODUCT_PHOTO_YES', title: '📸 Add Photo' },
    { id: 'PRODUCT_PHOTO_DONE', title: '✅ Done Adding' },
  ]);
}

async function handleProductPhotoDecision(phone, session, message) {
  const btnId = message.interactive?.button_reply?.id;
  if (btnId === 'PRODUCT_PHOTO_YES') {
    let currentCount = 0;
    try {
      const urls = session.photo_urls ? JSON.parse(session.photo_urls) : [];
      currentCount = urls.length;
    } catch { currentCount = 0; }
    if (currentCount >= 6) {
      await wa.sendText(phone, "That's 6 photos already, the max! Moving on...");
      return proceedPastPhotos(phone, session.id);
    }
    await sessionSvc.updateSession(session.id, { state: 'AWAITING_PRODUCT_PHOTO_UPLOAD' });
    return wa.sendText(phone, '📸 Send the product/shop photo now as an image.');
  }
  if (btnId === 'PRODUCT_PHOTO_DONE') return proceedPastPhotos(phone, session.id);
  return wa.sendButtons(phone, 'Please choose an option:', [
    { id: 'PRODUCT_PHOTO_YES', title: '📸 Add Photo' },
    { id: 'PRODUCT_PHOTO_DONE', title: '✅ Done Adding' },
  ]);
}

async function handleProductPhotoUpload(phone, session, message) {
  if (message.type !== 'image') {
    return wa.sendText(phone, '⚠️ Please send a photo as an image.');
  }
  await wa.sendText(phone, '⏳ Got it! Saving...');
  try {
    await saveUploadedPhoto(phone, session.id, message, 'product');
    await wa.sendText(phone, '✅ Photo saved!');
    return askForProductPhotos(phone, session.id, false);
  } catch (err) {
    console.error('Product photo upload error:', err.message);
    return wa.sendText(phone, '⚠️ Could not save that photo. Try again or type *skip*.');
  }
}

async function saveUploadedPhoto(phone, sessionId, message, photoType = 'person') {
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
  let urls = [], localPaths = [], types = [];
  try { urls = freshSession.photo_urls ? JSON.parse(freshSession.photo_urls) : []; } catch { urls = []; }
  try { localPaths = freshSession.photo_local_paths ? JSON.parse(freshSession.photo_local_paths) : []; } catch { localPaths = []; }
  try { types = freshSession.photo_types ? JSON.parse(freshSession.photo_types) : []; } catch { types = []; }

  urls.push(publicUrl);
  localPaths.push(localPath);
  types.push(photoType);

  await sessionSvc.updateSession(sessionId, {
    photo_urls: JSON.stringify(urls),
    photo_local_paths: JSON.stringify(localPaths),
    photo_types: JSON.stringify(types),
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
  if (btnId === 'PHOTO_SKIP') return advancePhotoRoleOrContinue(phone, session.id, roleStep);

  return wa.sendButtons(phone, 'Please choose an option:', [
    { id: 'PHOTO_YES', title: '📸 Upload Photo' },
    { id: 'PHOTO_SKIP', title: '⏭️ Skip' },
  ]);
}

async function handlePhotoUpload(phone, session, message) {
  if (message.type !== 'image') {
    return wa.sendText(phone, '⚠️ Please send a photo as an image, or type *skip* to continue.');
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

    const freshSession = await sessionSvc.getSessionById(session.id);
    let urls = [], localPaths = [];
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
    await wa.sendText(phone, '⚠️ Could not save that photo. Type *skip* to continue.');
  }
}

async function advancePhotoRoleOrContinue(phone, sessionId, completedRoleStep) {
  const freshSession = await sessionSvc.getSessionById(sessionId);
  const roles = getPhotoRoles(freshSession.category);
  const nextRoleStep = completedRoleStep + 1;

  if (nextRoleStep < roles.length) {
    await sessionSvc.updateSession(sessionId, { state: 'AWAITING_PHOTO_DECISION', photo_role_step: nextRoleStep });
    const nextRole = roles[nextRoleStep];
    return wa.sendButtons(phone, `Want to upload ${nextRole.label}?`, [
      { id: 'PHOTO_YES', title: '📸 Upload Photo' },
      { id: 'PHOTO_SKIP', title: '⏭️ Skip' },
    ]);
  }

  return proceedPastPhotos(phone, sessionId);
}

async function proceedPastPhotos(phone, sessionId) {
  const freshSession = await sessionSvc.getSessionById(sessionId);
  let photoCount = 0;
  try {
    const urls = freshSession.photo_urls ? JSON.parse(freshSession.photo_urls) : [];
    photoCount = urls.length;
  } catch { photoCount = 0; }

  if (photoCount > 0 && PERSON_PHOTO_CATEGORIES.has(freshSession.category) && !freshSession.outfit_preference) {
    await sessionSvc.updateSession(sessionId, { state: 'AWAITING_OUTFIT_PREFERENCE' });
    return wa.sendButtons(
      phone,
      '📸 Got the photo(s)! Should we *keep the exact outfit* or *upgrade it* for the flyer?',
      [
        { id: 'OUTFIT_KEEP', title: '👕 Keep Outfit' },
        { id: 'OUTFIT_UPGRADE', title: '✨ Upgrade Outfit' },
      ]
    );
  }

  if (SKIP_GENERIC_NAME_TAIL.has(freshSession.category)) {
    return askLanguage(phone, sessionId);
  }

  await sessionSvc.updateSession(sessionId, { state: 'CATEGORY_SELECTED' });
  return wa.sendText(phone, 'What is the *name* of the person this is for?');
}

async function handleOutfitPreference(phone, session, message) {
  const btnId = message.interactive?.button_reply?.id;
  const preference = btnId === 'OUTFIT_KEEP' ? 'keep outfits' : btnId === 'OUTFIT_UPGRADE' ? 'upgrade to suit flyer style' : null;

  if (!preference) {
    return wa.sendButtons(phone, 'Please choose an option:', [
      { id: 'OUTFIT_KEEP', title: '👕 Keep Outfit' },
      { id: 'OUTFIT_UPGRADE', title: '✨ Upgrade Outfit' },
    ]);
  }

  await sessionSvc.updateSession(session.id, { outfit_preference: preference });

  if (SKIP_GENERIC_NAME_TAIL.has(session.category)) return askLanguage(phone, session.id);

  await sessionSvc.updateSession(session.id, { state: 'CATEGORY_SELECTED' });
  return wa.sendText(phone, 'What is the *name* of the person this is for?');
}

async function askLanguage(phone, sessionId) {
  await sessionSvc.updateSession(sessionId, { state: 'AWAITING_LANGUAGE' });
  return wa.sendList(
    phone,
    '🎤 Voice Note Language',
    'What language will you record your voice note in?',
    'Choose Language',
    [{ title: 'Languages', rows: LANGUAGE_OPTIONS }]
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
    return wa.sendList(phone, '🎤 Voice Note Language', 'Please choose a language:', 'Choose Language',
      [{ title: 'Languages', rows: LANGUAGE_OPTIONS }]);
  }

  await sessionSvc.updateSession(session.id, { voice_language: voiceLanguage, state: 'AWAITING_VOICE' });
  await wa.sendButtons(
    phone,
    '🎤 Send a voice note and watch your meme unfold! ✨\n\nTell us what you want to say.\n\nOr type your message if you prefer.',
    [{ id: 'TYPE_MESSAGE', title: '⌨️ Type Instead' }]
  );
}

async function handleRecipientName(phone, session, message) {
  const name = message.text?.body?.trim();
  if (!name || name.length < 1) return wa.sendText(phone, '⚠️ Please enter a valid name.');

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
    return wa.sendButtons(phone, 'Please select the gender:', [
      { id: 'GENDER_MALE', title: '👨 Male' },
      { id: 'GENDER_FEMALE', title: '👩 Female' },
    ]);
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
    return wa.sendText(phone, '⌨️ Type your message now:');
  }

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

  if (message.text?.body) {
    const typed = message.text.body.trim();
    if (typed.length > 2) {
      await sessionSvc.updateSession(session.id, { voice_transcript: typed });
      await wa.sendText(phone, '✅ Got it! Generating your meme now... 🎨');
      return triggerPayment(phone, session);
    }
  }

  await wa.sendText(phone, '⚠️ Please send a voice note or type your message.');
}

async function triggerPayment(phone, session) {
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

    await sessionSvc.updateSession(session.id, { state: 'AWAITING_PAYMENT', payment_ref: reference });

    await wa.sendText(
      phone,
      `💳 *Almost there!*\n\nPay *₦${amount}* to unlock your flyer:\n\n${paymentUrl}\n\n_After payment, type *done* to confirm._`
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
  if (triggeringMessageId) await wa.markRead(triggeringMessageId, true);
  await wa.sendText(phone, '🎨 Payment confirmed! Creating your unique meme now...\n\n_This usually takes 1-3 minutes ✨_');
  await sessionSvc.updateSession(session.id, { state: 'GENERATING' });

  try {
    const freshSession = await sessionSvc.getSessionById(session.id);
    const { caption, imagePrompt } = await generateCaptionAndImagePrompt(freshSession);

    let photoLocalPaths = [];
    let photoTypes = [];
    try { photoLocalPaths = freshSession.photo_local_paths ? JSON.parse(freshSession.photo_local_paths) : []; } catch { photoLocalPaths = []; }
    try { photoTypes = freshSession.photo_types ? JSON.parse(freshSession.photo_types) : []; } catch { photoTypes = []; }

    const { publicUrl, localPath: generatedLocalPath } = await imageSvc.generateMemeImage({
      imagePrompt,
      recipientName: freshSession.recipient_name,
      category: freshSession.category,
      photoLocalPaths,
      photoTypes,
      outfitPreference: freshSession.outfit_preference,
    });

    await pool.query(
      `INSERT INTO generated_images (session_id, phone, caption, recipient_name, image_path)
       VALUES ($1, $2, $3, $4, $5)`,
      [session.id, phone, caption, freshSession.recipient_name, publicUrl]
    );

    await wa.sendImage(phone, publicUrl, caption);

    const thankYouMessages = {
      birthday: `🎂 *${freshSession.celebrant_name || freshSession.recipient_name}* go smile well well when dem see this -- you don show say you care. Enjoy the celebration! 🙏✨`,
      wedding: `💍 Una don create something beautiful to mark this love story. We honoured say you choose us to be part of am 🙏✨`,
      naming_ceremony: `👶 God bless this child and everyone wey go gather to celebrate am 🙏`,
      church: `⛪ This na more than a flyer -- na an invitation to encounter God 🙏🔥`,
      business_advert: `📢 Your business just got something wey go make people stop and look. We dey root for you 💪🙏`,
      customer_appreciation: `⭐ That customer go feel am for their heart. Na people like you dey build real businesses 🙏`,
      political: `🗳️ Leadership start with people seeing your vision -- now they fit see am 🙏`,
      academic: `🎓 All the late nights, the sacrifice -- e don pay off. This moment na yours 🙏✨`,
      thank_you: `🙏 You just made sure someone feels valued today. That kindness go reach them well 💚`,
      congratulations: `🎉 Every win deserve to be celebrated loud -- and now it is 💚`,
      apology: `😔 It take courage to say sorry well. We hope this opens the door for healing 🙏`,
      ask_money: `💸 You don put am out there in a way wey go land soft. We hope everything works out 😄🙏`,
      relationship: `💔 You don shoot your shot -- we dey root for you 🎯😄`,
    };
    const thankYou = thankYouMessages[freshSession.category] || `🙏 We are genuinely glad we could help bring this to life for you.`;
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
      '✅ Your flyer don land! 🔥\n\nWant a *voice shoutout* to go with it? 🎤\n\n_Just ₦200 extra_',
      [
        { id: 'SHOUTOUT_YES', title: '🎤 Yes! Add Shoutout' },
        { id: 'SHOUTOUT_NO', title: '✅ No, Am Good' },
      ]
    );
  } catch (err) {
    console.error('Generation error:', err.message);
    await sessionSvc.updateSession(session.id, { state: 'DONE' });
    await wa.sendText(phone, '❌ Something went wrong. Type *menu* to try again. Your payment is saved.');
  }
}

async function handleShoutoutDecision(phone, session, message) {
  const btnId = message.interactive?.button_reply?.id;
  if (btnId === 'SHOUTOUT_YES') {
    await wa.sendText(phone, '🎤 Shoutout feature coming very soon! Watch this space 🔥');
    return askForFeedback(phone, session.id);
  } else if (btnId === 'SHOUTOUT_NO') {
    await wa.sendText(phone, '🔥 Your flyer don ready! Save am and share!');
    return askForFeedback(phone, session.id);
  }
}

// ══════════════════════════════════════════════════════
// MUSIC FLOW — REDESIGNED
// Step 1: Category (Afrobeats/Gospel/Rap/Traditional/Soul)
// Step 2: Genre (subcategory within that category)
// Step 3: Who is it for
// Step 4: Language
// Step 5: Story / lyrics choice
// Step 6: Lyrics confirm
// Step 7: Payment → Generate
// ══════════════════════════════════════════════════════

async function sendMusicCategoryMenu(phone) {
  return wa.sendList(
    phone,
    '🎵 Choose Your Sound',
    'What category of music do you want?\n\nEach category has different styles inside 👇',
    'Pick Category',
    [
      {
        title: 'Music Categories',
        rows: [
          { id: 'MCAT_afrobeats', title: '🔥 Afrobeats & Pop' },
          { id: 'MCAT_gospel', title: '🙏 Gospel & Worship' },
          { id: 'MCAT_rap', title: '🎤 Rap & Spoken Word' },
          { id: 'MCAT_traditional', title: '🥁 Traditional & Cultural' },
          { id: 'MCAT_soul', title: '💫 Soul & Life Songs' },
        ],
      },
    ]
  );
}

async function handleMusicCategory(phone, session, message) {
  const selected = message.interactive?.list_reply?.id;

  const categoryMenus = {
    MCAT_afrobeats: sendAfrobeatsMenu,
    MCAT_gospel: sendGospelMenu,
    MCAT_rap: sendRapMenu,
    MCAT_traditional: sendTraditionalMenu,
    MCAT_soul: sendSoulMenu,
  };

  const menuFn = categoryMenus[selected];
  if (!menuFn) return sendMusicCategoryMenu(phone);

  await sessionSvc.updateSession(session.id, { state: 'MUSIC_GENRE' });
  return menuFn(phone);
}

async function sendAfrobeatsMenu(phone) {
  return wa.sendList(
    phone,
    '🔥 Afrobeats & Pop',
    'Which Afrobeats style?',
    'Pick Style',
    [
      {
        title: 'Afrobeats Styles',
        rows: [
          { id: 'GENRE_afrobeats', title: '🎵 Naija Afrobeats' },
          { id: 'GENRE_amapiano', title: '🎹 Amapiano' },
          { id: 'GENRE_street_pop', title: '🏙️ Street Pop' },
          { id: 'GENRE_pidgin_mix', title: '🌍 Pidgin + Yoruba Mix' },
        ],
      },
    ]
  );
}

async function sendGospelMenu(phone) {
  return wa.sendList(
    phone,
    '🙏 Gospel & Worship',
    'Which gospel style?',
    'Pick Style',
    [
      {
        title: 'Gospel Styles',
        rows: [
          { id: 'GENRE_gospel', title: '🎶 Afro-Gospel Praise' },
          { id: 'GENRE_deep_worship', title: '✨ Deep Slow Worship' },
          { id: 'GENRE_gospel_chant', title: '🥁 Gospel Chant' },
          { id: 'GENRE_gospel_praise', title: '🎺 Energetic Praise' },
          { id: 'GENRE_christian_rap', title: '🎤 Christian Rap' },
        ],
      },
    ]
  );
}

async function sendRapMenu(phone) {
  return wa.sendList(
    phone,
    '🎤 Rap & Spoken Word',
    'Which rap style?',
    'Pick Style',
    [
      {
        title: 'Rap Styles',
        rows: [
          { id: 'GENRE_naija_rap', title: '🏙️ Naija Street Rap' },
          { id: 'GENRE_christian_rap', title: '✝️ Christian Rap' },
          { id: 'GENRE_eminem_rap', title: '⚡ Fast Technical Rap' },
        ],
      },
    ]
  );
}

async function sendTraditionalMenu(phone) {
  return wa.sendList(
    phone,
    '🥁 Traditional & Cultural',
    'Which cultural style?',
    'Pick Style',
    [
      {
        title: 'Cultural Styles',
        rows: [
          { id: 'GENRE_igbo_highlife', title: '🥁 Igbo Highlife + Ogene' },
          { id: 'GENRE_pidgin_igbo', title: '🔀 Pidgin + Igbo Fusion' },
          { id: 'GENRE_yoruba_juju', title: '🎸 Yoruba Juju + Oriki' },
          { id: 'GENRE_hausa_pidgin', title: '🌙 Hausa + Pidgin' },
        ],
      },
    ]
  );
}

async function sendSoulMenu(phone) {
  return wa.sendList(
    phone,
    '💫 Soul & Life Songs',
    'Which soul style?',
    'Pick Style',
    [
      {
        title: 'Soul Styles',
        rows: [
          { id: 'GENRE_slow_soul', title: '💔 Slow Soul / Life Song' },
          { id: 'GENRE_amapiano', title: '🎹 Smooth Amapiano' },
          { id: 'GENRE_deep_worship', title: '✨ Deep Worship' },
        ],
      },
    ]
  );
}

async function handleMusicGenre(phone, session, message) {
  const selected = message.interactive?.list_reply?.id;

  const genreMap = {
    GENRE_afrobeats: 'afrobeats',
    GENRE_amapiano: 'amapiano',
    GENRE_street_pop: 'street_pop',
    GENRE_pidgin_mix: 'pidgin_mix',
    GENRE_gospel: 'gospel',
    GENRE_deep_worship: 'deep_worship',
    GENRE_gospel_chant: 'gospel_chant',
    GENRE_gospel_praise: 'gospel_praise',
    GENRE_christian_rap: 'christian_rap',
    GENRE_naija_rap: 'naija_rap',
    GENRE_eminem_rap: 'eminem_rap',
    GENRE_igbo_highlife: 'igbo_highlife',
    GENRE_pidgin_igbo: 'pidgin_igbo',
    GENRE_yoruba_juju: 'yoruba_juju',
    GENRE_hausa_pidgin: 'hausa_pidgin',
    GENRE_slow_soul: 'slow_soul',
  };

  const genre = genreMap[selected];
  if (!genre) return sendMusicCategoryMenu(phone);

  await sessionSvc.updateSession(session.id, {
    music_genre: genre,
    state: 'MUSIC_PERSON_NAME',
  });

  return wa.sendText(
    phone,
    `🎯 Great choice!\n\nWho is this song for?\n\nTell me their *name* and anything special about them.\n\n_e.g. "My sister Amaka, she just graduated from UNILAG after 5 years of hustle. She's from Anambra."_`
  );
}

async function handleMusicPersonName(phone, session, message) {
  const text = message.text?.body?.trim();
  if (!text || text.length < 2) return wa.sendText(phone, '⚠️ Please tell me who the song is for.');

  await sessionSvc.updateSession(session.id, { music_person_name: text, state: 'MUSIC_LANGUAGE' });

  // Gospel and worship genres — skip language selection, use appropriate language
  const gospelGenres = ['gospel', 'deep_worship', 'gospel_chant', 'gospel_praise', 'christian_rap'];
  const genre = session.music_genre;

  if (genre === 'igbo_highlife' || genre === 'pidgin_igbo') {
    await sessionSvc.updateSession(session.id, { music_language: 'Nigerian Pidgin mixed with Igbo naturally' });
    return askMusicStory(phone, session.id);
  }

  if (genre === 'yoruba_juju') {
    await sessionSvc.updateSession(session.id, { music_language: 'Yoruba' });
    return askMusicStory(phone, session.id);
  }

  if (genre === 'hausa_pidgin') {
    await sessionSvc.updateSession(session.id, { music_language: 'Hausa mixed with Pidgin' });
    return askMusicStory(phone, session.id);
  }

  if (genre === 'slow_soul' || genre === 'eminem_rap') {
    await sessionSvc.updateSession(session.id, { music_language: 'English' });
    return askMusicStory(phone, session.id);
  }

  // All other genres — let user choose language
  return wa.sendList(
    phone,
    '🗣️ Song Language',
    'Which language for the song?',
    'Pick Language',
    [
      {
        title: 'Languages',
        rows: [
          { id: 'MLANG_pidgin', title: '🇳🇬 Pidgin (₦1,000)' },
          { id: 'MLANG_english', title: '🌍 English (₦1,000)' },
          { id: 'MLANG_igbo', title: '🏡 Igbo (₦1,500)' },
          { id: 'MLANG_yoruba', title: '🌿 Yoruba (₦1,500)' },
          { id: 'MLANG_hausa', title: '🌙 Hausa (₦1,500)' },
          { id: 'MLANG_pidgin_yoruba', title: '🔀 Pidgin+Yoruba (₦1,500)' },
          { id: 'MLANG_pidgin_igbo', title: '🔀 Pidgin+Igbo (₦1,500)' },
        ],
      },
    ]
  );
}

async function handleMusicLanguage(phone, session, message) {
  const selected = message.interactive?.list_reply?.id;
  const langMap = {
    MLANG_pidgin: 'Nigerian Pidgin English',
    MLANG_english: 'English',
    MLANG_igbo: 'Igbo',
    MLANG_yoruba: 'Yoruba',
    MLANG_hausa: 'Hausa',
    MLANG_pidgin_yoruba: 'Nigerian Pidgin mixed with Yoruba naturally',
    MLANG_pidgin_igbo: 'Nigerian Pidgin mixed with Igbo naturally',
  };

  const lang = langMap[selected];
  if (!lang) return wa.sendText(phone, '⚠️ Please pick a language from the list.');

  await sessionSvc.updateSession(session.id, { music_language: lang });
  return askMusicStory(phone, session.id);
}

async function askMusicStory(phone, sessionId) {
  await sessionSvc.updateSession(sessionId, { state: 'MUSIC_STORY' });

  await wa.sendButtons(
    phone,
    `🎤 Almost there!\n\nDo you have *your own lyrics* already written, or should we write them for you?\n\n_If you have lyrics tap "My Own Lyrics" and paste them. Otherwise tap "Write For Me" and tell us the story._`,
    [
      { id: 'LYRICS_CUSTOM', title: '✏️ My Own Lyrics' },
      { id: 'LYRICS_AI', title: '🤖 Write For Me' },
    ]
  );
}

async function handleMusicStory(phone, session, message) {
  const btnId = message.interactive?.button_reply?.id;

  // User wants to write own lyrics
  if (btnId === 'LYRICS_CUSTOM') {
    await sessionSvc.updateSession(session.id, { state: 'MUSIC_LYRICS_EDIT', music_using_custom: true });
    return wa.sendText(
      phone,
      `✏️ Paste your lyrics now.\n\nUse these tags:\n\n[Verse]\nyour verse here\n\n[Chorus]\nyour chorus here\n\n_Send when ready 👇_`
    );
  }

  // User wants AI to write — ask for story
  if (btnId === 'LYRICS_AI') {
    await sessionSvc.updateSession(session.id, { state: 'MUSIC_STORY' });
    return wa.sendText(
      phone,
      `🎤 Tell me the *story or message* for this song.\n\nThe more details you give, the more personal and powerful the song will be 🔥\n\n_e.g. "My friend Tunde just got his first job at GTBank after 2 years of hustling. He is from Ibadan. He almost gave up last year. Make something that hypes him up and mentions his struggle"_\n\nOr send a voice note 🎙️`
    );
  }

  let story = '';

  // Voice note
  if (message.type === 'audio') {
    await wa.sendText(phone, '⏳ Got your voice note! Transcribing...');
    try {
      const { buffer, mimeType } = await wa.downloadMedia(message.audio.id);
      story = await voiceSvc.transcribeVoiceNote(buffer, mimeType, 'english');
      await wa.sendText(phone, `✅ I heard:\n\n_"${story}"_`);
    } catch (err) {
      console.error('Music voice transcription error:', err.message);
      return wa.sendText(phone, '⚠️ Could not process voice note. Please type your story instead:');
    }
  } else if (message.text?.body?.trim().length > 2) {
    story = message.text.body.trim();
  } else {
    return wa.sendText(phone, '⚠️ Please type your story or send a voice note.');
  }

  await sessionSvc.updateSession(session.id, { music_story: story });

  // Generate lyrics preview
  await wa.sendText(phone, '✍️ Writing your lyrics... hold on 🎵');
  try {
    const freshSession = await sessionSvc.getSessionById(session.id);
    const musicData = await buildMusicPrompt(freshSession);

    await sessionSvc.updateSession(session.id, {
      state: 'MUSIC_LYRICS_CONFIRM',
      music_generated_lyrics: musicData.lyrics,
      music_suno_prompt: musicData.tags,
      music_suno_negative: musicData.negativeTags,
      music_title: musicData.title,
    });

    await wa.sendText(
      phone,
      `📝 *Here are your lyrics:*\n\n${musicData.lyrics}\n\n---\n🎵 _"${musicData.previewLine}"_`
    );

    return wa.sendButtons(
      phone,
      'How do these lyrics look? 👆',
      [
        { id: 'LYRICS_APPROVE', title: '✅ Use These' },
        { id: 'LYRICS_REWRITE', title: '🔄 Rewrite' },
        { id: 'LYRICS_EDIT', title: '✏️ Edit Myself' },
      ]
    );
  } catch (err) {
    console.error('Lyrics generation error:', err.message);
    await wa.sendText(phone, '⚠️ Could not generate lyrics right now. Type *menu* to try again.');
  }
}

async function handleLyricsConfirm(phone, session, message) {
  const btnId = message.interactive?.button_reply?.id;

  if (btnId === 'LYRICS_APPROVE') {
    return triggerMusicPayment(phone, session);
  }

  if (btnId === 'LYRICS_REWRITE') {
    await sessionSvc.updateSession(session.id, {
      music_generated_lyrics: null,
      music_suno_prompt: null,
      music_title: null,
    });
    await wa.sendText(phone, '🔄 Rewriting your lyrics...');
    try {
      const freshSession = await sessionSvc.getSessionById(session.id);
      const musicData = await buildMusicPrompt(freshSession);

      await sessionSvc.updateSession(session.id, {
        music_generated_lyrics: musicData.lyrics,
        music_suno_prompt: musicData.tags,
        music_suno_negative: musicData.negativeTags,
        music_title: musicData.title,
      });

      await wa.sendText(phone, `📝 *New lyrics:*\n\n${musicData.lyrics}\n\n---\n🎵 _"${musicData.previewLine}"_`);

      return wa.sendButtons(
        phone,
        'How do these look? 👆',
        [
          { id: 'LYRICS_APPROVE', title: '✅ Use These' },
          { id: 'LYRICS_REWRITE', title: '🔄 Rewrite Again' },
          { id: 'LYRICS_EDIT', title: '✏️ Edit Myself' },
        ]
      );
    } catch (err) {
      console.error('Lyrics rewrite error:', err.message);
      await wa.sendText(phone, '⚠️ Could not rewrite. Type *menu* to try again.');
    }
  }

  if (btnId === 'LYRICS_EDIT') {
    await sessionSvc.updateSession(session.id, { state: 'MUSIC_LYRICS_EDIT' });
    return wa.sendText(
      phone,
      '✏️ Send your edited lyrics now.\n\nYou can copy the lyrics above, change what you want, and send back.\n\nUse *[Verse]*, *[Chorus]*, *[Bridge]* tags.'
    );
  }
}

async function handleLyricsEdit(phone, session, message) {
  const text = message.text?.body?.trim();
  if (!text || text.length < 10) {
    return wa.sendText(phone, '⚠️ Please paste your lyrics. They seem too short.');
  }

  await sessionSvc.updateSession(session.id, {
    music_generated_lyrics: text,
    music_custom_lyrics: text,
    state: 'MUSIC_LYRICS_CONFIRM',
  });

  await wa.sendText(phone, `📝 *Your lyrics:*\n\n${text}`);

  return wa.sendButtons(
    phone,
    'Ready to generate your song with these lyrics? 🎵',
    [
      { id: 'LYRICS_APPROVE', title: '✅ Generate Song' },
      { id: 'LYRICS_EDIT', title: '✏️ Edit Again' },
    ]
  );
}

async function triggerMusicPayment(phone, session) {
  const normalizedPhone = phone.replace(/[^0-9]/g, '');
  if (normalizedPhone === ADMIN_PHONE) {
    await wa.sendText(phone, '🔓 Admin mode -- skipping payment. Generating song now...');
    return generateAndSendSong(phone, session);
  }

  try {
    const freshSession = await sessionSvc.getSessionById(session.id);
    const isPremium = isPremiumLanguage(freshSession.music_language);
    const category = session.mode === 'bundle' ? 'bundle' : (isPremium ? 'music_premium' : 'music_quick');

    const { paymentUrl, reference, amount } = await paymentSvc.initializePayment({
      phone,
      sessionId: session.id,
      category,
    });

    await sessionSvc.updateSession(session.id, {
      state: 'MUSIC_AWAITING_PAYMENT',
      payment_ref: reference,
    });

    const description = session.mode === 'bundle'
      ? '🎁 *Flyer + Song Bundle*'
      : '🎵 *Your song is ready to be created!*';

    await wa.sendText(
      phone,
      `${description}\n\nPay *₦${amount}* to generate your personalised Nigerian song:\n\n${paymentUrl}\n\n_After payment, type *done* to confirm._`
    );
  } catch (err) {
    console.error('Music payment error:', err.message);
    await wa.sendText(phone, '❌ Payment initialization failed. Type *menu* to try again.');
  }
}

async function handleMusicPaymentCheck(phone, session, message) {
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

  return generateAndSendSong(phone, session);
}

async function generateAndSendSong(phone, session) {
  await wa.sendText(
    phone,
    '🎵 Payment confirmed! Creating your personalised Nigerian song now...\n\n_This usually takes 2-3 minutes. We dey cook something special for you_ 🔥'
  );

  try {
    const freshSession = await sessionSvc.getSessionById(session.id);

    let lyrics = freshSession.music_generated_lyrics || freshSession.music_custom_lyrics;
    let tags = freshSession.music_suno_prompt;
    let negativeTags = freshSession.music_suno_negative;
    let title = freshSession.music_title;

    // If somehow we don't have lyrics yet, build them now
    if (!lyrics || !tags) {
      await wa.sendText(phone, '✍️ Writing your lyrics...');
      const musicData = await buildMusicPrompt(freshSession);
      lyrics = musicData.lyrics;
      tags = musicData.tags;
      negativeTags = musicData.negativeTags;
      title = musicData.title;
    }

    await wa.sendText(phone, '🎼 Recording your song... ⏳');

    const result = await musicSvc.generateSong({ lyrics, tags, negativeTags, title });

    // Send the audio
    await wa.sendAudio(phone, result.publicUrl);

    // Send cover art if available — this is what was missing before
    if (result.imageUrl) {
      await wa.sendImage(phone, result.imageUrl, `🎵 ${result.title}`);
    }

    await wa.sendText(
      phone,
      `🎵 *${result.title}*\n\nYour song don ready! 🔥\n\nSave am, share am on WhatsApp Status, send am to who it's for 💚\n\n_Made with NaijaMeme Studio 🎨🎵_`
    );

    await pool.query(
      'UPDATE users SET total_orders = total_orders + 1, updated_at = NOW() WHERE phone = $1',
      [phone]
    );

    if (freshSession.mode === 'bundle') {
      await wa.sendText(phone, '🖼️ Now let\'s create your flyer! Which category fits best?');
      await sessionSvc.updateSession(session.id, { state: 'MENU' });
      return sendMenu(phone);
    }

    return askForFeedback(phone, session.id);

  } catch (err) {
    console.error('Song generation error:', err.message);
    await wa.sendText(
      phone,
      '❌ Something went wrong generating your song. Type *menu* to try again. Your payment is saved.'
    );
  }
}

// ══════════════════════════════════════════════════════
// FEEDBACK
// ══════════════════════════════════════════════════════

async function askForFeedback(phone, sessionId) {
  await sessionSvc.updateSession(sessionId, { state: 'AWAITING_FEEDBACK_RATING' });
  return wa.sendList(
    phone,
    '💬 Quick Feedback',
    'How was your experience? Your honest rating helps us improve 🙏',
    'Rate Us',
    [
      {
        title: 'Your Rating',
        rows: [
          { id: 'RATING_5', title: '5 stars - Excellent' },
          { id: 'RATING_4', title: '4 stars - Good' },
          { id: 'RATING_3', title: '3 stars - Okay' },
          { id: 'RATING_2', title: '2 stars - Not Great' },
          { id: 'RATING_1', title: '1 star - Poor' },
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
    return wa.sendList(phone, '💬 Quick Feedback', 'Please pick a rating:', 'Rate Us', [
      { title: 'Your Rating', rows: [
        { id: 'RATING_5', title: '5 stars - Excellent' },
        { id: 'RATING_4', title: '4 stars - Good' },
        { id: 'RATING_3', title: '3 stars - Okay' },
        { id: 'RATING_2', title: '2 stars - Not Great' },
        { id: 'RATING_1', title: '1 star - Poor' },
      ]},
    ]);
  }

  await sessionSvc.updateSession(session.id, { feedback_rating: rating, state: 'AWAITING_FEEDBACK_COMMENT' });

  const followUp = rating <= 3
    ? 'Thanks for the honesty 🙏 What could we have done better? Type your thoughts, or type *skip*.'
    : '🙌 We\'re glad you enjoyed it! Any suggestions? Type them now, or type *skip*.';

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

  if (session.feedback_rating <= 3 || comment) {
    const stars = session.feedback_rating + ' out of 5';
    const alertMsg = `📋 *New Feedback*\n\nFrom: ${phone}\nCategory: ${session.category}\nRating: ${stars}\n${comment ? `Comment: "${comment}"` : 'No comment left'}`;
    await wa.sendText(ADMIN_PHONE, alertMsg);
  }

  await wa.sendButtons(
    phone,
    '🙏 Thank you for your feedback! It genuinely helps us get better.\n\nWant to create another?',
    [{ id: 'RESTART', title: '🔄 Create Another' }]
  );
}

module.exports = { handleIncomingMessage, generateAndSend };
