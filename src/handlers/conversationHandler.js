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
  thank_you: 'Thank You',
  apology: 'Apology',
  ask_money: 'Ask for Money',
  customer_appreciation: 'Customer Appreciation',
  congratulations: 'Congratulations',
  church: 'Church/Ministry',
  business_advert: 'Business Advert',
  political: 'Political Campaign',
  relationship: 'Shoot Your Shot',
  academic: 'Academic Achievement',
  birthday: 'Birthday',
  naming_ceremony: 'Naming Ceremony',
  wedding: 'Wedding',
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
    case 'MUSIC_GENRE': return handleMusicGenre(phone, session, message);
    case 'MUSIC_OCCASION': return handleMusicOccasion(phone, session, message);
    case 'MUSIC_PERSON_NAME': return handleMusicPersonName(phone, session, message);
    case 'MUSIC_LANGUAGE': return handleMusicLanguage(phone, session, message);
    case 'MUSIC_STORY': return handleMusicStory(phone, session, message);
    case 'MUSIC_LYRICS_CONFIRM': return handleLyricsConfirm(phone, session, message);
    case 'MUSIC_LYRICS_EDIT': return handleLyricsEdit(phone, session, message);
    case 'MUSIC_AWAITING_PAYMENT': return handleMusicPaymentCheck(phone, session, message);
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
    'NaijaMeme Bot',
    'Welcome! Na wetin you wan create today?\n\nPick one option below',
    'Choose',
    [
      {
        title: 'Choose Your Creation',
        rows: [
          { id: 'MAIN_FLYER', title: 'Create a Flyer' },
          { id: 'MAIN_SONG', title: 'Create a Song' },
          { id: 'MAIN_BUNDLE', title: 'Flyer and Song Bundle' },
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
    await sessionSvc.updateSession(session.id, { state: 'MUSIC_GENRE', mode: 'song' });
    return sendMusicGenreMenu(phone);
  }

  if (selected === 'MAIN_BUNDLE') {
    await sessionSvc.updateSession(session.id, { state: 'MUSIC_GENRE', mode: 'bundle' });
    await wa.sendText(phone, 'Flyer and Song Bundle selected! N2,000 for both.\n\nLet us start with your song.');
    return sendMusicGenreMenu(phone);
  }

  return sendMainMenu(phone);
}

// ══════════════════════════════════════════════════════
// FLYER FLOW
// ══════════════════════════════════════════════════════

async function sendMenu(phone) {
  await wa.sendList(
    phone,
    'NaijaMeme Bot',
    'What type of flyer do you want?\n\nPick a category below',
    'Choose Category',
    [
      {
        title: 'Personal Messages',
        rows: [
          { id: 'CAT_thank_you', title: 'Thank You' },
          { id: 'CAT_apology', title: 'Apology' },
          { id: 'CAT_ask_money', title: 'Ask for Money' },
          { id: 'CAT_relationship', title: 'Shoot Your Shot' },
          { id: 'CAT_congratulations', title: 'Congratulations' },
        ],
      },
      {
        title: 'Celebrations',
        rows: [
          { id: 'CAT_birthday', title: 'Birthday' },
          { id: 'CAT_naming_ceremony', title: 'Naming Ceremony' },
          { id: 'CAT_wedding', title: 'Wedding' },
        ],
      },
    ]
  );

  await wa.sendList(
    phone,
    'More Categories',
    'Business, church and special categories',
    'Choose Category',
    [
      {
        title: 'Business and Special',
        rows: [
          { id: 'CAT_customer_appreciation', title: 'Customer Appreciation' },
          { id: 'CAT_business_advert', title: 'Business Advert' },
          { id: 'CAT_church', title: 'Church and Ministry' },
          { id: 'CAT_political', title: 'Political Campaign' },
          { id: 'CAT_academic', title: 'Academic Achievement' },
        ],
      },
    ]
  );
}

async function handleMenuSelection(phone, session, message) {
  const selected = message.interactive?.list_reply?.id || message.interactive?.button_reply?.id;
  const category = CATEGORIES[selected];

  if (!category) {
    return wa.sendText(phone, 'Please select a valid option. Type menu to start over.');
  }

  if (STRUCTURED_CATEGORIES.has(category)) {
    const questions = STRUCTURED_QUESTIONS[category];
    await sessionSvc.updateSession(session.id, {
      state: 'STRUCTURED_QA',
      category,
      structured_step: 0,
    });
    await wa.sendText(phone, `${CATEGORY_LABELS[category]} selected!\n\nA few quick questions to make your flyer look professional.`);
    return wa.sendText(phone, questions[0].prompt);
  }

  await sessionSvc.updateSession(session.id, { state: 'CATEGORY_SELECTED', category });
  await wa.sendText(phone, `${CATEGORY_LABELS[category]} selected!\n\nWhat is the name of the person you are sending this to?`);
}

async function handleStructuredAnswer(phone, session, message) {
  const category = session.category;
  const questions = STRUCTURED_QUESTIONS[category];
  const step = session.structured_step || 0;
  const currentQuestion = questions[step];

  const answer = message.text?.body?.trim();
  if (!answer || answer.length < 1) {
    return wa.sendText(phone, 'Please type an answer to continue.');
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
      'Got all the details!\n\nDo you have a business logo to upload?',
      [
        { id: 'LOGO_YES', title: 'Upload Logo' },
        { id: 'LOGO_SKIP', title: 'Create One For Me' },
      ]
    );
  }

  const roles = getPhotoRoles(freshSession.category);
  await sessionSvc.updateSession(sessionId, { state: 'AWAITING_PHOTO_DECISION', photo_role_step: 0 });

  const firstRole = roles[0];
  return wa.sendButtons(
    phone,
    `Got all the details!\n\nWant to upload ${firstRole.label}? Real photos make designs look personal and premium.`,
    [
      { id: 'PHOTO_YES', title: 'Upload Photo' },
      { id: 'PHOTO_SKIP', title: 'Skip' },
    ]
  );
}

async function handleLogoDecision(phone, session, message) {
  const btnId = message.interactive?.button_reply?.id;
  if (btnId === 'LOGO_YES') {
    await sessionSvc.updateSession(session.id, { state: 'AWAITING_LOGO_UPLOAD' });
    return wa.sendText(phone, 'Send your business logo now as an image.');
  }
  if (btnId === 'LOGO_SKIP') {
    await sessionSvc.updateSession(session.id, { has_no_logo: true });
    return askForProductPhotos(phone, session.id, true);
  }
  return wa.sendButtons(phone, 'Please choose an option:', [
    { id: 'LOGO_YES', title: 'Upload Logo' },
    { id: 'LOGO_SKIP', title: 'Create One For Me' },
  ]);
}

async function handleLogoUpload(phone, session, message) {
  if (message.type !== 'image') {
    return wa.sendText(phone, 'Please send your logo as an image.');
  }
  await wa.sendText(phone, 'Got your logo! Saving it...');
  try {
    await saveUploadedPhoto(phone, session.id, message, 'logo');
    await wa.sendText(phone, 'Logo saved!');
    return askForProductPhotos(phone, session.id, false);
  } catch (err) {
    console.error('Logo upload error:', err.message);
    return wa.sendText(phone, 'Could not save that logo. Type skip to continue.');
  }
}

async function askForProductPhotos(phone, sessionId, isFirstAsk) {
  await sessionSvc.updateSession(sessionId, { state: 'AWAITING_PRODUCT_PHOTO_DECISION' });
  const prompt = isFirstAsk
    ? 'No wahala! Want to upload product or shop photos? You can add up to 6.'
    : 'Want to add another product photo? Up to 6 total.';
  return wa.sendButtons(phone, prompt, [
    { id: 'PRODUCT_PHOTO_YES', title: 'Add Photo' },
    { id: 'PRODUCT_PHOTO_DONE', title: 'Done Adding' },
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
      await wa.sendText(phone, 'That is 6 photos already, the max! Moving on...');
      return proceedPastPhotos(phone, session.id);
    }
    await sessionSvc.updateSession(session.id, { state: 'AWAITING_PRODUCT_PHOTO_UPLOAD' });
    return wa.sendText(phone, 'Send the product or shop photo now as an image.');
  }
  if (btnId === 'PRODUCT_PHOTO_DONE') return proceedPastPhotos(phone, session.id);
  return wa.sendButtons(phone, 'Please choose an option:', [
    { id: 'PRODUCT_PHOTO_YES', title: 'Add Photo' },
    { id: 'PRODUCT_PHOTO_DONE', title: 'Done Adding' },
  ]);
}

async function handleProductPhotoUpload(phone, session, message) {
  if (message.type !== 'image') {
    return wa.sendText(phone, 'Please send a photo as an image.');
  }
  await wa.sendText(phone, 'Got it! Saving...');
  try {
    await saveUploadedPhoto(phone, session.id, message, 'product');
    await wa.sendText(phone, 'Photo saved!');
    return askForProductPhotos(phone, session.id, false);
  } catch (err) {
    console.error('Product photo upload error:', err.message);
    return wa.sendText(phone, 'Could not save that photo. Try again or type skip.');
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
    return wa.sendText(phone, `Send ${currentRole.label} now as an image.`);
  }
  if (btnId === 'PHOTO_SKIP') return advancePhotoRoleOrContinue(phone, session.id, roleStep);

  return wa.sendButtons(phone, 'Please choose an option:', [
    { id: 'PHOTO_YES', title: 'Upload Photo' },
    { id: 'PHOTO_SKIP', title: 'Skip' },
  ]);
}

async function handlePhotoUpload(phone, session, message) {
  if (message.type !== 'image') {
    return wa.sendText(phone, 'Please send a photo as an image, or type skip to continue.');
  }
  await wa.sendText(phone, 'Got your photo! Saving it...');
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

    await wa.sendText(phone, 'Photo saved!');
    const roleStep = freshSession.photo_role_step || 0;
    return advancePhotoRoleOrContinue(phone, session.id, roleStep);
  } catch (err) {
    console.error('Photo upload error:', err.message);
    await wa.sendText(phone, 'Could not save that photo. Type skip to continue.');
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
      { id: 'PHOTO_YES', title: 'Upload Photo' },
      { id: 'PHOTO_SKIP', title: 'Skip' },
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
      'Got the photos! Should we keep the exact outfit or upgrade it for the flyer?',
      [
        { id: 'OUTFIT_KEEP', title: 'Keep Outfit' },
        { id: 'OUTFIT_UPGRADE', title: 'Upgrade Outfit' },
      ]
    );
  }

  if (SKIP_GENERIC_NAME_TAIL.has(freshSession.category)) {
    return askLanguage(phone, sessionId);
  }

  await sessionSvc.updateSession(sessionId, { state: 'CATEGORY_SELECTED' });
  return wa.sendText(phone, 'What is the name of the person this is for?');
}

async function handleOutfitPreference(phone, session, message) {
  const btnId = message.interactive?.button_reply?.id;
  const preference = btnId === 'OUTFIT_KEEP' ? 'keep outfits' : btnId === 'OUTFIT_UPGRADE' ? 'upgrade to suit flyer style' : null;

  if (!preference) {
    return wa.sendButtons(phone, 'Please choose an option:', [
      { id: 'OUTFIT_KEEP', title: 'Keep Outfit' },
      { id: 'OUTFIT_UPGRADE', title: 'Upgrade Outfit' },
    ]);
  }

  await sessionSvc.updateSession(session.id, { outfit_preference: preference });

  if (SKIP_GENERIC_NAME_TAIL.has(session.category)) return askLanguage(phone, session.id);

  await sessionSvc.updateSession(session.id, { state: 'CATEGORY_SELECTED' });
  return wa.sendText(phone, 'What is the name of the person this is for?');
}

async function askLanguage(phone, sessionId) {
  await sessionSvc.updateSession(sessionId, { state: 'AWAITING_LANGUAGE' });
  return wa.sendList(
    phone,
    'Voice Note Language',
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
    return wa.sendList(phone, 'Voice Note Language', 'Please choose a language:', 'Choose Language',
      [{ title: 'Languages', rows: LANGUAGE_OPTIONS }]);
  }

  await sessionSvc.updateSession(session.id, { voice_language: voiceLanguage, state: 'AWAITING_VOICE' });
  await wa.sendButtons(
    phone,
    'Send a voice note and watch your meme unfold!\n\nTell us what you want to say. Or type your message if you prefer.',
    [{ id: 'TYPE_MESSAGE', title: 'Type Instead' }]
  );
}

async function handleRecipientName(phone, session, message) {
  const name = message.text?.body?.trim();
  if (!name || name.length < 1) return wa.sendText(phone, 'Please enter a valid name.');

  await sessionSvc.updateSession(session.id, { state: 'RECIPIENT_NAME', recipient_name: name });
  await wa.sendButtons(
    phone,
    `Perfect! Sending to ${name}.\n\nWhat gender is ${name}?`,
    [
      { id: 'GENDER_MALE', title: 'Male' },
      { id: 'GENDER_FEMALE', title: 'Female' },
    ]
  );
}

async function handleGender(phone, session, message) {
  const btnId = message.interactive?.button_reply?.id;
  const gender = btnId === 'GENDER_MALE' ? 'male' : btnId === 'GENDER_FEMALE' ? 'female' : null;

  if (!gender) {
    return wa.sendButtons(phone, 'Please select the gender:', [
      { id: 'GENDER_MALE', title: 'Male' },
      { id: 'GENDER_FEMALE', title: 'Female' },
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
    return wa.sendText(phone, 'Type your message now:');
  }

  if (message.type === 'audio') {
    await wa.sendText(phone, 'Got your voice note! Transcribing...');
    try {
      const { buffer, mimeType } = await wa.downloadMedia(message.audio.id);
      const transcript = await voiceSvc.transcribeVoiceNote(buffer, mimeType, session.voice_language);
      await sessionSvc.updateSession(session.id, { voice_transcript: transcript });
      await wa.sendText(phone, `Perfect! I heard:\n\n"${transcript}"\n\nGenerating your meme now...`);
      return triggerPayment(phone, session);
    } catch (err) {
      console.error('Voice error:', err.message);
      await wa.sendText(phone, 'Could not process voice note. Please type your message instead:');
      return;
    }
  }

  if (message.text?.body) {
    const typed = message.text.body.trim();
    if (typed.length > 2) {
      await sessionSvc.updateSession(session.id, { voice_transcript: typed });
      await wa.sendText(phone, 'Got it! Generating your meme now...');
      return triggerPayment(phone, session);
    }
  }

  await wa.sendText(phone, 'Please send a voice note or type your message.');
}

async function triggerPayment(phone, session) {
  const normalizedPhone = phone.replace(/[^0-9]/g, '');
  if (normalizedPhone === ADMIN_PHONE) {
    await wa.sendText(phone, 'Admin mode -- skipping payment. Generating now...');
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
      `Almost there!\n\nPay N${amount} to unlock your flyer:\n\n${paymentUrl}\n\nAfter payment, type done to confirm.`
    );
  } catch (err) {
    console.error('Payment error:', err.message);
    await wa.sendText(phone, 'Payment initialization failed. Type menu to try again.');
  }
}

async function handlePaymentCheck(phone, session, message) {
  const text = (message.text?.body || '').trim().toLowerCase();
  if (!['done', 'paid', 'complete', 'check'].includes(text)) {
    return wa.sendText(phone, 'Waiting for payment... Type done after paying or menu to restart.');
  }

  const result = await pool.query(
    "SELECT status FROM payments WHERE session_id = $1 AND status = 'success' LIMIT 1",
    [session.id]
  );

  if (result.rows.length === 0) {
    return wa.sendText(phone, 'Payment not confirmed yet. Complete payment then type done.');
  }

  return generateAndSend(phone, session, message.id);
}

async function generateAndSend(phone, session, triggeringMessageId) {
  if (triggeringMessageId) await wa.markRead(triggeringMessageId, true);
  await wa.sendText(phone, 'Payment confirmed! Creating your unique meme now...\n\nThis usually takes 1-3 minutes.');
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
      birthday: `${freshSession.celebrant_name || freshSession.recipient_name} go smile well well when dem see this. Enjoy the celebration!`,
      wedding: `Una don create something beautiful to mark this love story.`,
      naming_ceremony: `God bless this child and everyone wey go gather to celebrate am.`,
      church: `This na more than a flyer -- na an invitation to encounter God.`,
      business_advert: `Your business just got something wey go make people stop and look. We dey root for you.`,
      customer_appreciation: `That customer go feel am for their heart. Na people like you dey build real businesses.`,
      political: `Leadership start with people seeing your vision -- now they fit see am.`,
      academic: `All the late nights, the sacrifice -- e don pay off. This moment na yours.`,
      thank_you: `You just made sure someone feels valued today.`,
      congratulations: `Every win deserve to be celebrated loud.`,
      apology: `It take courage to say sorry well. We hope this opens the door for healing.`,
      ask_money: `We hope everything works out for you.`,
      relationship: `You don shoot your shot -- we dey root for you.`,
    };
    const thankYou = thankYouMessages[freshSession.category] || `We are genuinely glad we could help bring this to life for you.`;
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
      'Your flyer don land!\n\nWant a voice shoutout to go with it? Just N200 extra.',
      [
        { id: 'SHOUTOUT_YES', title: 'Yes Add Shoutout' },
        { id: 'SHOUTOUT_NO', title: 'No Am Good' },
      ]
    );
  } catch (err) {
    console.error('Generation error:', err.message);
    await sessionSvc.updateSession(session.id, { state: 'DONE' });
    await wa.sendText(phone, 'Something went wrong. Type menu to try again. Your payment is saved.');
  }
}

async function handleShoutoutDecision(phone, session, message) {
  const btnId = message.interactive?.button_reply?.id;
  if (btnId === 'SHOUTOUT_YES') {
    await wa.sendText(phone, 'Shoutout feature coming very soon! Watch this space.');
    return askForFeedback(phone, session.id);
  } else if (btnId === 'SHOUTOUT_NO') {
    await wa.sendText(phone, 'Your flyer don ready! Save am and share!');
    return askForFeedback(phone, session.id);
  }
}

// ══════════════════════════════════════════════════════
// MUSIC FLOW
// ══════════════════════════════════════════════════════

async function sendMusicGenreMenu(phone) {
  return wa.sendList(
    phone,
    'Choose Your Sound',
    'Which style of music do you want?',
    'Pick Genre',
    [
      {
        title: 'Afrobeats and Pop',
        rows: [
          { id: 'GENRE_afrobeats', title: 'Afrobeats' },
          { id: 'GENRE_amapiano', title: 'Amapiano' },
          { id: 'GENRE_street_pop', title: 'Street Pop Asake style' },
          { id: 'GENRE_pidgin_mix', title: 'Pidgin and Yoruba Mix' },
        ],
      },
      {
        title: 'Gospel highlife and Rap',
        rows: [
          { id: 'GENRE_igbo_highlife', title: 'Igbo Highlife Ogene' },
          { id: 'GENRE_pidgin_igbo', title: 'Pidgin and Igbo Fusion' },
          { id: 'GENRE_yoruba_juju', title: 'Yoruba Juju Praise' },
          { id: 'GENRE_gospel', title: 'Gospel and Gospel Rap' },
          { id: 'GENRE_naija_rap', title: 'Naija Street Rap' },
          { id: 'GENRE_eminem_rap', title: 'Fast English Rap' },
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
    GENRE_igbo_highlife: 'igbo_highlife',
    GENRE_pidgin_igbo: 'pidgin_igbo',
    GENRE_yoruba_juju: 'yoruba_juju',
    GENRE_gospel: 'gospel',
    GENRE_street_pop: 'street_pop',
    GENRE_naija_rap: 'naija_rap',
    GENRE_eminem_rap: 'eminem_rap',
    GENRE_pidgin_mix: 'pidgin_mix',
  };

  const genre = genreMap[selected];
  if (!genre) return sendMusicGenreMenu(phone);

  await sessionSvc.updateSession(session.id, { music_genre: genre, state: 'MUSIC_OCCASION' });

  return wa.sendList(
    phone,
    'What is the Occasion?',
    'What is this song for?',
    'Pick Occasion',
    [
      {
        title: 'Occasions',
        rows: [
          { id: 'OCC_birthday', title: 'Birthday' },
          { id: 'OCC_wedding', title: 'Wedding' },
          { id: 'OCC_owambe', title: 'Owambe and Party' },
          { id: 'OCC_graduation', title: 'Graduation' },
          { id: 'OCC_church', title: 'Church and Testimony' },
          { id: 'OCC_business', title: 'Business Jingle' },
          { id: 'OCC_love', title: 'Love and Dedication' },
          { id: 'OCC_motivation', title: 'Motivation and Hustle' },
          { id: 'OCC_banter', title: 'Banter and Roast' },
          { id: 'OCC_custom', title: 'Something Else' },
        ],
      },
    ]
  );
}

async function handleMusicOccasion(phone, session, message) {
  const selected = message.interactive?.list_reply?.id;
  const occasionMap = {
    OCC_birthday: 'birthday celebration',
    OCC_wedding: 'wedding',
    OCC_owambe: 'owambe party hype',
    OCC_graduation: 'graduation',
    OCC_church: 'church testimony and thanksgiving',
    OCC_business: 'business jingle and promotion',
    OCC_love: 'love dedication',
    OCC_motivation: 'motivation and hustle anthem',
    OCC_banter: 'friendly banter and roasting a friend',
    OCC_custom: 'custom',
  };

  const occasion = occasionMap[selected];
  if (!occasion) return wa.sendText(phone, 'Please pick an occasion from the list.');

  await sessionSvc.updateSession(session.id, { music_occasion: occasion, state: 'MUSIC_PERSON_NAME' });

  return wa.sendText(
    phone,
    `Who is this song for?\n\nTell me their name and anything special about them.\n\nExample: My sister Amaka, she just graduated from UNILAG after 5 years of hustle`
  );
}

async function handleMusicPersonName(phone, session, message) {
  const text = message.text?.body?.trim();
  if (!text || text.length < 2) return wa.sendText(phone, 'Please tell me who the song is for.');

  await sessionSvc.updateSession(session.id, { music_person_name: text, state: 'MUSIC_LANGUAGE' });

  return wa.sendList(
    phone,
    'Song Language',
    'Which language for the song?',
    'Pick Language',
    [
      {
        title: 'Languages',
        rows: [
          { id: 'MLANG_pidgin', title: 'Pidgin N1000' },
          { id: 'MLANG_english', title: 'English N1000' },
          { id: 'MLANG_igbo', title: 'Igbo N1500' },
          { id: 'MLANG_yoruba', title: 'Yoruba N1500' },
          { id: 'MLANG_hausa', title: 'Hausa N1500' },
          { id: 'MLANG_pidgin_yoruba', title: 'Pidgin and Yoruba N1500' },
          { id: 'MLANG_pidgin_igbo', title: 'Pidgin and Igbo N1500' },
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
  if (!lang) return wa.sendText(phone, 'Please pick a language from the list.');

  await sessionSvc.updateSession(session.id, { music_language: lang, state: 'MUSIC_STORY' });

  await wa.sendButtons(
    phone,
    `Almost there!\n\nDo you have your own lyrics already written, or should we write them for you?\n\nIf you have lyrics tap My Own Lyrics and paste them in. Otherwise tap Write For Me and tell us the story.`,
    [
      { id: 'LYRICS_CUSTOM', title: 'My Own Lyrics' },
      { id: 'LYRICS_AI', title: 'Write For Me' },
    ]
  );
}

async function handleMusicStory(phone, session, message) {
  const btnId = message.interactive?.button_reply?.id;

  if (btnId === 'LYRICS_CUSTOM') {
    await sessionSvc.updateSession(session.id, { state: 'MUSIC_LYRICS_EDIT', music_using_custom: true });
    return wa.sendText(
      phone,
      `Paste your lyrics now.\n\nUse these tags to structure them:\n\n[Verse]\nyour verse here\n\n[Chorus]\nyour chorus here\n\nSend when ready.`
    );
  }

  if (btnId === 'LYRICS_AI' || btnId === 'MUSIC_TYPE_INSTEAD') {
    await sessionSvc.updateSession(session.id, { state: 'MUSIC_STORY' });
    return wa.sendText(
      phone,
      `Tell me the story or message for this song.\n\nThe more details, the more personal and powerful your song will be.\n\nExample: My friend Tunde just got his first job at GTBank after 2 years of hustling. He is from Ibadan. Hype him up!\n\nOr send a voice note.`
    );
  }

  let story = '';

  if (message.type === 'audio') {
    await wa.sendText(phone, 'Got your voice note! Transcribing...');
    try {
      const { buffer, mimeType } = await wa.downloadMedia(message.audio.id);
      story = await voiceSvc.transcribeVoiceNote(buffer, mimeType, 'english');
      await wa.sendText(phone, `I heard:\n\n"${story}"`);
    } catch (err) {
      console.error('Music voice transcription error:', err.message);
      return wa.sendText(phone, 'Could not process voice note. Please type your story instead:');
    }
  } else if (message.text?.body?.trim().length > 2) {
    story = message.text.body.trim();
  } else {
    return wa.sendText(phone, 'Please type your story or send a voice note.');
  }

  await sessionSvc.updateSession(session.id, { music_story: story });

  await wa.sendText(phone, 'Writing your lyrics... give me a moment.');
  try {
    const freshSession = await sessionSvc.getSessionById(session.id);
    const { lyrics, sunoPrompt, title, previewLine } = await buildMusicPrompt(freshSession);

    await sessionSvc.updateSession(session.id, {
      state: 'MUSIC_LYRICS_CONFIRM',
      music_generated_lyrics: lyrics,
      music_suno_prompt: sunoPrompt,
      music_title: title,
    });

    await wa.sendText(
      phone,
      `Here are your lyrics:\n\n${lyrics}\n\n---\nCatchy line: "${previewLine}"`
    );

    return wa.sendButtons(
      phone,
      'How do these lyrics look?',
      [
        { id: 'LYRICS_APPROVE', title: 'Use These' },
        { id: 'LYRICS_REWRITE', title: 'Rewrite' },
        { id: 'LYRICS_EDIT', title: 'Edit Myself' },
      ]
    );
  } catch (err) {
    console.error('Lyrics generation error:', err.message);
    await wa.sendText(phone, 'Could not generate lyrics right now. Type menu to try again.');
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
    await wa.sendText(phone, 'Rewriting your lyrics...');
    try {
      const freshSession = await sessionSvc.getSessionById(session.id);
      const { lyrics, sunoPrompt, title, previewLine } = await buildMusicPrompt(freshSession);

      await sessionSvc.updateSession(session.id, {
        music_generated_lyrics: lyrics,
        music_suno_prompt: sunoPrompt,
        music_title: title,
      });

      await wa.sendText(phone, `New lyrics:\n\n${lyrics}\n\n---\nCatchy line: "${previewLine}"`);

      return wa.sendButtons(
        phone,
        'How do these look?',
        [
          { id: 'LYRICS_APPROVE', title: 'Use These' },
          { id: 'LYRICS_REWRITE', title: 'Rewrite Again' },
          { id: 'LYRICS_EDIT', title: 'Edit Myself' },
        ]
      );
    } catch (err) {
      console.error('Lyrics rewrite error:', err.message);
      await wa.sendText(phone, 'Could not rewrite lyrics. Type menu to try again.');
    }
  }

  if (btnId === 'LYRICS_EDIT') {
    await sessionSvc.updateSession(session.id, { state: 'MUSIC_LYRICS_EDIT' });
    return wa.sendText(
      phone,
      'Send your edited lyrics now.\n\nYou can paste the lyrics above and change whatever you want.\n\nUse [Verse], [Chorus], [Bridge] tags to structure them.'
    );
  }
}

async function handleLyricsEdit(phone, session, message) {
  const text = message.text?.body?.trim();
  if (!text || text.length < 10) {
    return wa.sendText(phone, 'Please paste your lyrics. They seem too short.');
  }

  await sessionSvc.updateSession(session.id, {
    music_generated_lyrics: text,
    music_custom_lyrics: text,
    state: 'MUSIC_LYRICS_CONFIRM',
  });

  await wa.sendText(phone, `Your lyrics:\n\n${text}`);

  return wa.sendButtons(
    phone,
    'Ready to generate your song with these lyrics?',
    [
      { id: 'LYRICS_APPROVE', title: 'Generate Song' },
      { id: 'LYRICS_EDIT', title: 'Edit Again' },
    ]
  );
}

async function triggerMusicPayment(phone, session) {
  const normalizedPhone = phone.replace(/[^0-9]/g, '');
  if (normalizedPhone === ADMIN_PHONE) {
    await wa.sendText(phone, 'Admin mode -- skipping payment. Generating song now...');
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
      ? 'Flyer and Song Bundle'
      : 'Your song is ready to be created!';

    await wa.sendText(
      phone,
      `${description}\n\nPay N${amount} to generate your personalised Nigerian song:\n\n${paymentUrl}\n\nAfter payment, type done to confirm.`
    );
  } catch (err) {
    console.error('Music payment error:', err.message);
    await wa.sendText(phone, 'Payment initialization failed. Type menu to try again.');
  }
}

async function handleMusicPaymentCheck(phone, session, message) {
  const text = (message.text?.body || '').trim().toLowerCase();
  if (!['done', 'paid', 'complete', 'check'].includes(text)) {
    return wa.sendText(phone, 'Waiting for payment... Type done after paying or menu to restart.');
  }

  const result = await pool.query(
    "SELECT status FROM payments WHERE session_id = $1 AND status = 'success' LIMIT 1",
    [session.id]
  );

  if (result.rows.length === 0) {
    return wa.sendText(phone, 'Payment not confirmed yet. Complete payment then type done.');
  }

  return generateAndSendSong(phone, session);
}

async function generateAndSendSong(phone, session) {
  await wa.sendText(
    phone,
    'Payment confirmed! Creating your personalised Nigerian song now...\n\nThis usually takes 2-3 minutes. We dey cook something special.'
  );

  try {
    const freshSession = await sessionSvc.getSessionById(session.id);

    let lyrics = freshSession.music_generated_lyrics || freshSession.music_custom_lyrics;
    let sunoPrompt = freshSession.music_suno_prompt;
    let title = freshSession.music_title;

    if (!lyrics || !sunoPrompt) {
      await wa.sendText(phone, 'Writing your lyrics...');
      const built = await buildMusicPrompt(freshSession);
      lyrics = built.lyrics;
      sunoPrompt = built.sunoPrompt;
      title = built.title;
    }

    await wa.sendText(phone, 'Recording your song... 2-3 minutes.');

    const { publicUrl, title: songTitle } = await musicSvc.generateSong({
      sunoPrompt,
      lyrics,
      title,
    });

    await wa.sendAudio(phone, publicUrl);
    await wa.sendText(
      phone,
      `${songTitle}\n\nYour song don ready!\n\nSave am and share am on WhatsApp Status.\n\nMade with NaijaMeme Bot.`
    );

    await pool.query(
      'UPDATE users SET total_orders = total_orders + 1, updated_at = NOW() WHERE phone = $1',
      [phone]
    );

    if (freshSession.mode === 'bundle') {
      await wa.sendText(phone, 'Now let us create your flyer! Which category fits best?');
      await sessionSvc.updateSession(session.id, { state: 'MENU' });
      return sendMenu(phone);
    }

    return askForFeedback(phone, session.id);

  } catch (err) {
    console.error('Song generation error:', err.message);
    await wa.sendText(
      phone,
      'Something went wrong generating your song. Type menu to try again. Your payment is saved.'
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
    'Quick Feedback',
    'How was your experience? Your honest rating helps us improve.',
    'Rate Us',
    [
      {
        title: 'Your Rating',
        rows: [
          { id: 'RATING_5', title: 'Excellent' },
          { id: 'RATING_4', title: 'Good' },
          { id: 'RATING_3', title: 'Okay' },
          { id: 'RATING_2', title: 'Not Great' },
          { id: 'RATING_1', title: 'Poor' },
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
    return wa.sendList(phone, 'Quick Feedback', 'Please pick a rating:', 'Rate Us', [
      { title: 'Your Rating', rows: [
        { id: 'RATING_5', title: 'Excellent' },
        { id: 'RATING_4', title: 'Good' },
        { id: 'RATING_3', title: 'Okay' },
        { id: 'RATING_2', title: 'Not Great' },
        { id: 'RATING_1', title: 'Poor' },
      ]},
    ]);
  }

  await sessionSvc.updateSession(session.id, { feedback_rating: rating, state: 'AWAITING_FEEDBACK_COMMENT' });

  const followUp = rating <= 3
    ? 'Thanks for the honesty. What could we have done better? Type your thoughts, or type skip.'
    : 'Glad you enjoyed it! Any suggestions? Type them now, or type skip.';

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
    const alertMsg = `New Feedback\n\nFrom: ${phone}\nCategory: ${session.category}\nRating: ${stars}\n${comment ? `Comment: "${comment}"` : 'No comment left'}`;
    await wa.sendText(ADMIN_PHONE, alertMsg);
  }

  await wa.sendButtons(
    phone,
    'Thank you for your feedback! It genuinely helps us get better.\n\nWant to create another?',
    [{ id: 'RESTART', title: 'Create Another' }]
  );
}

module.exports = { handleIncomingMessage, generateAndSend };
