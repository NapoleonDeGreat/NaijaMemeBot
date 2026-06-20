const OpenAI = require('openai');
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// =============================================
// PHRASE BANK
// Kept ONLY for the personal/emotional categories,
// where a punchy pre-written Nigerian phrase is more
// reliable than asking GPT to invent one from scratch.
// Structured/business/church categories no longer use
// archetype or scenario banks -- they're driven by the
// DESIGNER LOGIC philosophy below instead.
// =============================================

const PHRASE_BANK = {
  thank_you: [
    'Na you do pass! God go bless you well well',
    'You too much! I no fit express am for mouth',
    'See as you take save my life today -- God bless your hustle',
    'E be like say God send you -- thank you die',
    'You spoil me! I go always remember this day',
    'My person! You never disappoint -- na loyalty be this',
    'Omo, you dey show love anyhow -- I appreciate you die',
    'This one wey you do for me -- heaven go remember you',
  ],
  apology: [
    'I mess up, I know -- but my love for [NAME] never change',
    'No fine words -- I just want [NAME] to forgive me',
    'I sorry die -- [NAME] please na, I no go do am again',
    'This one pain me too -- I never mean to hurt [NAME]',
    'I been wrong, I admit am -- [NAME] you too important to lose',
    'Forgive me [NAME] -- I promise say things go change',
    'I no fit sleep well since -- [NAME] please hear me out',
  ],
  ask_money: [
    '[NAME] I know say I get liver -- but na only you I fit ask',
    'My person, I no want beg but situation don push me -- help me',
    'I promise I go pay back -- [NAME] na you be my last resort',
    'God go bless you if you help [NAME] right now -- e dey urgent',
    'I no go forget this one -- [NAME] please na, just this once',
    'My situation bad bad -- [NAME] you be my miracle today',
    'I dey come to you because I know say your heart dey -- help me [NAME]',
  ],
  congratulations: [
    '[NAME] you don make am! God wey start this go finish am well',
    'From struggle to glory -- e no easy but you do am!',
    'Omo see as God show up for [NAME] -- congratulations die!',
    'Your time don reach -- nothing go stop you again!',
    'We always know say [NAME] go shine -- today na proof!',
    'Every prayer, every hustle -- e don pay! Congratulations!',
    '[NAME] level don change -- e no go pass you!',
    'Today na testimony day for [NAME] -- God too faithful!',
  ],
  relationship: [
    '[NAME] since I see you my heart never rest -- make I be your person',
    'I no dey good with plenty words -- but I know say I want [NAME] for life',
    '[NAME] you be the one wey dey scatter my brain in a good way',
    'I don carry this feeling too long -- [NAME] answer me',
    'God create [NAME] special -- and I want to be the one to say thank you daily',
    '[NAME] my heart dey do anyhow when you dey around -- that means something',
    'I fit love plenty people but [NAME] na different thing entirely',
  ],
};

// Categories that use the phrase bank for a guaranteed punchy line.
// Everything else (church, business_advert, customer_appreciation,
// political, academic) relies on GPT inventing copy guided by the
// designer-logic philosophy and the real structured details.
const PERSONAL_CATEGORIES = new Set([
  'thank_you',
  'apology',
  'ask_money',
  'congratulations',
  'relationship',
]);

// Maps category -> which structured fields it collects, for building
// the "STRUCTURED DETAILS" block sent to GPT. Keys match the session
// columns added in migration.sql.
const STRUCTURED_FIELD_LABELS = {
  church: {
    church_name: 'Church name',
    programme_title: 'Programme title',
    theme: 'Theme',
    event_date: 'Date',
    event_time: 'Time',
    venue: 'Venue',
    guest_minister: 'Guest minister',
    style_preference: 'Colour/style preference',
  },
  business_advert: {
    business_name: 'Business name',
    offer_product: 'Offer/Product',
    contact_info: 'Contact info',
    style_preference: 'Colour/style preference',
  },
  customer_appreciation: {
    business_name: 'Business name',
    offer_product: 'What the customer is being appreciated for',
    contact_info: 'Contact info',
    style_preference: 'Colour/style preference',
  },
  political: {
    candidate_name: 'Candidate name',
    position_title: 'Position contesting for',
    party_slogan: 'Party/Slogan',
    election_date: 'Election date',
    style_preference: 'Colour/style preference',
  },
  academic: {
    school_name: 'School/Institution name',
    achievement_name: 'Achievement/Event name',
    achievement_date: 'Date',
    style_preference: 'Colour/style preference',
  },
  birthday: {
    celebrant_name: 'Celebrant name',
    celebration_date: 'Date',
    celebrant_relationship: 'Relationship to sender',
    celebration_wish: 'Birthday wish/message',
    style_preference: 'Colour/style preference',
  },
  naming_ceremony: {
    baby_name: "Baby's name",
    parents_names: "Parents' names",
    naming_date: 'Date',
    naming_venue: 'Venue',
    style_preference: 'Colour/style preference',
  },
  wedding: {
    bride_name: "Bride's name",
    groom_name: "Groom's name",
    wedding_date: 'Date',
    wedding_venue: 'Venue',
    style_preference: 'Colour/style preference',
    outfit_preference: 'Outfit preference (keep exact outfit vs upgrade to wedding attire)',
  },
};

// Genre guidance per category -- tells GPT which end of the
// restrained-premium <-> expressive-meme spectrum to lean toward.
const GENRE_GUIDANCE = {
  church: 'PREMIUM PROGRAMME FLYER genre: bold metallic/foil-style hero typography for the programme title, dramatic but reverent real photography. If multiple speaker/minister photos are provided, arrange them in a professional portrait-grid row (evenly spaced circular or rectangular headshots, each labeled with the person name and title beneath, exactly like a real Nigerian church programme flyer -- see DLCF, RCCG, Winners Chapel flyer style). Add contextual background imagery matching the programme theme: revival = dramatic fire and light rays; harvest = gold and abundance; prayer = mountain and dawn light; worship = raised hands and radiant cross beams. Clean horizontal data band for date/time/venue. Restrained but powerful. Think 10-year Nigerian church flyer designer, not a meme.',
  business_advert: 'PREMIUM BUSINESS FLYER genre: treat the business name as an actual logo lockup (short monogram/icon mark + confident name typography + optional one-line tagline beneath). Clean real product photography arranged in organized bands or diagonal sections, NOT a busy collage. Short confident motto. Trust badges/contact info kept small and secondary. Disciplined 2-3 colour palette. Think premium Nigerian brand flyer, not a meme.',
  customer_appreciation: 'PREMIUM BUSINESS FLYER genre, same principles as business_advert above, but the focal point is the named customer and a warm personal thank-you moment rather than a product launch. Still restrained and premium, not busy.',
  political: 'CAMPAIGN POSTER genre: bold confident hero typography for candidate name and slogan, strong directional cinematic lighting, party colour palette used with discipline (not overwhelming), clean data band for position/election date. Premium campaign poster energy, not a meme.',
  academic: 'CELEBRATION EDITORIAL genre: similar to a premium birthday/celebration flyer -- elegant typography hierarchy with the achievement and name as hero, soft glamour-style lighting, minimal restrained iconography, optional ghosted secondary portrait for depth. Proud and premium, not busy.',
  thank_you: 'EXPRESSIVE PERSONAL MEME genre: this one CAN be busier and more playful -- real human emotion, a speech-bubble moment with the chosen phrase, layered graphic elements (notification-style card, colour-block banner) are appropriate here. More energy and humour than the categories above.',
  apology: 'EXPRESSIVE PERSONAL MEME genre: sincere, emotionally real, can use a speech-bubble moment and softer layered elements. Less playful than thank_you, more tender, but still allowed more visual energy than the premium-flyer categories.',
  ask_money: 'EXPRESSIVE PERSONAL MEME genre: humour and exaggeration are welcome here -- this is meant to be funny and relatable, can be busy and playful with a speech-bubble moment.',
  congratulations: 'EXPRESSIVE PERSONAL MEME genre: celebratory energy, can use layered elements (confetti, banners, a speech-bubble or callout), more visual energy than the premium-flyer categories.',
  relationship: 'EXPRESSIVE PERSONAL MEME genre: romantic, Nollywood-tinted, can use a speech-bubble moment, softer and more cinematic than thank_you/congratulations but still more playful/expressive than the premium-flyer categories.',
  birthday: 'PREMIUM CELEBRATION EDITORIAL genre: magazine-cover energy. The celebrant\'s name and "Happy Birthday" are the typographic hero, elegant script accent paired with one strong display face, soft glamour-style lighting, a subtle ghosted secondary portrait for depth is welcome, restrained decorative motifs (florals, ribbons, confetti) used sparingly not abundantly. If a real photo was uploaded, it must be the clear visual centerpiece. Premium and editorial, not busy or meme-like.',
  naming_ceremony: 'PREMIUM CELEBRATION EDITORIAL genre, same principles as birthday: elegant typography hero (baby\'s name prominent), soft warm family-celebration lighting, restrained decorative motifs (consider baby-related soft motifs: tiny footprints, simple florals), clean data band for date/venue if relevant. Premium and joyful, not busy.',
  wedding: 'PREMIUM WEDDING INVITATION genre: both names in equal elegant typographic weight. CRITICAL PHOTO RULE: only accept a couple photo showing both people together in one image -- do not try to merge two separate individual portraits. If a real couple photo was uploaded, PRESERVE both faces exactly as uploaded (face-lock: same eyes, nose, jawline, skin tone for both people) -- this is non-negotiable. CLOTHING RULE: check the "Outfit preference" structured detail -- if it says "keep outfits" or similar, PRESERVE the exact clothing from the photo unchanged, only replace the background/add design elements around them; if it says "upgrade to wedding attire" or similar (or if no preference given), upgrade clothing to formal wedding attire. If no photo uploaded, generate a beautiful AI Nigerian couple in wedding attire. Soft romantic florals, restrained ribbons or gold accents, clean data band for date/venue. Cinematic, premium, editorial -- not busy.',
};

const DESIGNER_LOGIC_PHILOSOPHY = `You are a senior Nigerian graphic designer with 10+ years of experience designing premium flyers, social media campaigns, and brand creative for real Nigerian businesses, churches, and individuals. Your work looks like it belongs on the Instagram feed of a top Lagos/Abuja design studio -- never like a generic AI-generated template.

YOUR DESIGN PHILOSOPHY -- apply this thinking to every brief:

1. RESTRAINT OVER CLUTTER: a premium design has ONE strong focal point, not five competing ones. Before adding any element, ask whether it serves the hierarchy or just fills space. If a design starts to feel busy, remove elements rather than shrink them. Generous negative space reads as premium; cramming every inch reads as cheap. (This rule bends for the EXPRESSIVE PERSONAL MEME genre below, where more energy is appropriate.)

2. ONE COHESIVE COLOUR STORY: pick a primary colour, one supporting neutral (cream, navy, charcoal, white), and use a single accent colour sparingly -- never as a dominant background. If the user states a colour preference or dislike, that overrides any default. Do not default to gold+black as a generic "premium" cliche unless specifically requested.

3. TYPOGRAPHY IS THE HERO, NOT DECORATION: one large, well-weighted headline treatment (the name, the event title, the business name) should dominate, with everything else subordinate in size and visual weight. Mix at most one elegant script/cursive accent with one strong sans or serif display face.

4. REAL PHOTOGRAPHIC QUALITY, CINEMATIC LIGHT: describe lighting and photographic treatment like a real photoshoot -- directional light, soft falloff, a sense of depth (foreground subject, midground, soft background) -- not flat illustration. A subtle ghosted duplicate or soft secondary portrait can add depth without clutter.

5. INFORMATION ARCHITECTURE OVER DECORATION: facts (date, time, venue, contact, name) belong in a clean, evenly-weighted data row or band -- small icon + label pairs in one consistent style, aligned together. This is the place for clarity and trust, not sparkle bursts or comic bubbles (except in the EXPRESSIVE PERSONAL MEME genre).

6. THE LOGO LOCKUP RULE: a business or brand name should be composed like an actual logo -- a short monogram or icon mark, paired with the name in a confident typeface, with an optional one-line tagline beneath in a smaller weight, placed where a real logo would sit.

7. MATCH THE GENRE TO THE CATEGORY -- you will be told which genre applies for this specific request. Follow it precisely rather than applying one style to everything.

8. CONTEXT-AWARE COLOUR AND IMAGERY INTELLIGENCE: before picking a colour palette, reason hard about what this specific business or subject actually is and what its real customers already associate with it visually -- do not default to a generic "premium navy and gold" palette for everything. If DESIGN RESEARCH CONTEXT is provided below (from a live web search), treat it as ground truth for what real designs in this category look like and follow its colour/layout conventions closely.

   For a recognized brand (OPay = teal/turquoise and white, GTBank = orange and navy, MTN = bright yellow, Airtel = red, Access Bank = navy and orange, Dangote = blue and red, Indomie = red and yellow) use their actual brand colours -- never invent a palette for a known brand.

   For category-specific imagery, reason like a specialist:
   - Grain/food sellers: warm ochres and earthy browns, real grains with visible texture (burlap sacks, loose rice, dried maize, sorghum)
   - Auto dealerships: sleek dark charcoal/black with electric blue or chrome accent, showroom lighting, reflective floors, the actual vehicle types being sold rendered with real automotive detail (not generic car silhouettes)
   - Fashion/clothing: the brand's actual colour story, fabric texture close-ups, runway or boutique lighting
   - Hotels/hospitality: warm cream/gold/navy, richly textured food and room imagery (steaming jollof in a ceramic bowl, crisp hotel linen, warm amber lighting)
   - Electronics/phones/tech: clean minimal dark backgrounds, product photography lighting, sharp reflections
   - Beauty/cosmetics: soft pastel or jewel tones, glowing skin lighting, elegant product arrangement
   - Real estate/construction: structured navy/grey with gold accent, architectural photography style, blueprints or skyline imagery
   - Logistics/transport: bold primary colours (blue/orange/red), dynamic motion lines, route/map imagery

   For church programmes, the programme title and theme should drive the imagery metaphor (revival = fire/light; harvest = abundance/gold; prayer = mountain/dawn; worship = raised hands and radiant light). Never default to generic purple-and-gold unless the brief specifically calls for it.

9. IMAGE PROMPT STRUCTURE (CRITICAL -- follow this exactly, do NOT pile adjectives):
   gpt-image-2 is a reasoning model that understands natural language descriptions. It does NOT respond well to keyword stuffing ("8K ultra-realistic cinematic masterpiece") -- those words actively distract it and produce blurry text and cluttered results. Instead, describe like a director briefing a cinematographer:
   
   Structure every image prompt as: [SUBJECT] → [SETTING/ENVIRONMENT] → [LIGHTING] → [COMPOSITION/LENS] → [TEXT ELEMENTS in "quotes" or ALL CAPS] → [CONSTRAINTS]
   
   For lighting, name the actual light source and direction: "warm afternoon sunlight from the left, soft shadow falling right, rim light separating subject from background" -- NOT "cinematic dramatic lighting"
   For lens/depth: "85mm portrait lens, subject sharp, background soft bokeh" -- NOT "ultra-realistic depth of field"  
   For text in the image: put every word that must appear EXACTLY inside "English quotes" or write it in ALL CAPS -- gpt-image-2 renders quoted/capped text with >95% accuracy
   For materials and skin: describe the specific texture -- "smooth dark Nigerian skin catching warm light", "ankara fabric with orange and blue geometric pattern" -- NOT "ultra-realistic skin"
   Use ONE primary visual tone word maximum (moody, warm, dramatic, elegant) -- NOT a list of synonyms

10. SELF-CRITIQUE BEFORE FINALIZING: before writing the final image prompt, ask whether a real Nigerian business owner or celebrant would proudly post this on their own Instagram, or whether it looks like a template anyone could generate. If it leans template, strip elements back, sharpen the typographic hero, and commit harder to a single disciplined colour story.`;

// =============================================
// DESIGN RESEARCH (Responses API + web_search tool)
// Runs a quick live web search to ground GPT-5.5's design decisions
// in what real Nigerian flyers/posters in this category actually look
// like, instead of designing purely from memory. Non-fatal: if the
// search fails or times out, generation proceeds without it rather
// than blocking the user.
// =============================================
const RESEARCH_QUERY_MAP = {
  church: (s) => `Nigerian church programme flyer design "${s.programme_title || 'revival'}" layout`,
  business_advert: (s) => `Nigerian "${s.offer_product || 'business'}" advert flyer design layout colours`,
  customer_appreciation: (s) => `Nigerian customer appreciation flyer design layout`,
  political: (s) => `Nigerian political campaign poster design layout`,
  birthday: (s) => `Nigerian premium birthday flyer design layout`,
  wedding: (s) => `Nigerian wedding invitation flyer design layout`,
  naming_ceremony: (s) => `Nigerian naming ceremony flyer design layout`,
  academic: (s) => `Nigerian graduation achievement flyer design layout`,
};

async function researchDesignContext(category, session) {
  const queryFn = RESEARCH_QUERY_MAP[category];
  if (!queryFn) return '';

  const query = queryFn(session);

  try {
    const response = await client.responses.create({
      model: 'gpt-5.5',
      tools: [{ type: 'web_search' }],
      input: `Search for real examples of: ${query}. In under 120 words, describe: (1) typical colour palette and visual style for this specific category, (2) common layout conventions (where text/photos/data usually sit), (3) any Nigerian-specific design details worth matching. Be concrete and specific, not generic.`,
    });

    return response.output_text || '';
  } catch (err) {
    console.error('Design research web search failed (non-fatal):', err.message);
    return '';
  }
}

async function generateCaptionAndImagePrompt(session) {
  const {
    category,
    recipient_name: recipientName,
    voice_transcript: voiceTranscript,
    notes,
    gender,
    photo_urls: photoUrlsJson,
  } = session;

  let photoUrls = [];
  try {
    photoUrls = photoUrlsJson ? JSON.parse(photoUrlsJson) : [];
  } catch {
    photoUrls = [];
  }

  const isPersonal = PERSONAL_CATEGORIES.has(category);

  // Run live design research for structured (non-personal) categories --
  // grounds the design in what real Nigerian flyers actually look like.
  // Skipped for personal/meme categories where it adds little value.
  const researchContext = !isPersonal ? await researchDesignContext(category, session) : '';
  const researchBlock = researchContext
    ? `\nDESIGN RESEARCH CONTEXT (from a live web search of real Nigerian designs in this category -- use this to ground your colour and layout decisions):\n${researchContext}\n`
    : '';
  const genreGuidance = GENRE_GUIDANCE[category] || GENRE_GUIDANCE.thank_you;

  // Build the structured-details block, if this category collects any
  const fieldMap = STRUCTURED_FIELD_LABELS[category];
  let structuredDetails = '';
  if (fieldMap) {
    const lines = Object.entries(fieldMap)
      .map(([col, label]) => {
        const val = session[col];
        if (!val) return null;
        const normalized = val.trim().toLowerCase();
        if (normalized === 'skip' || normalized === 'none' || normalized === 'n/a') return null;
        return `${label}: ${val}`;
      })
      .filter(Boolean);
    if (lines.length > 0) {
      structuredDetails = `\nSTRUCTURED DETAILS PROVIDED BY USER (real facts -- use these exact values verbatim, never invent placeholder values when these are present):\n${lines.join('\n')}\n`;
    }
  }

  // Build the phrase bank block, only for personal categories
  let phraseBlock = '';
  if (isPersonal) {
    const phrases = PHRASE_BANK[category] || PHRASE_BANK.thank_you;
    const phraseList = phrases.map((p, i) => `${i + 1}. ${p}`).join('\n');
    phraseBlock = `\nNIGERIAN PHRASES (pick ONE that fits, personalize with the real recipient name -- replace [NAME]):\n${phraseList}\n`;
  }

  const context = [
    `Recipient name: ${recipientName}`,
    gender ? `Recipient gender: ${gender}` : null,
    voiceTranscript ? `What the sender recorded/typed: "${voiceTranscript}"` : null,
    notes ? `Extra notes: ${notes}` : null,
  ].filter(Boolean).join('\n');

  let photoInstruction = '';
  if (photoUrls.length === 1) {
    photoInstruction = `\nIMPORTANT: The user uploaded one real reference photo (of themselves, their pastor, candidate, or business logo) that will be used as a reference image during generation. Write the image prompt so it makes sense for that real photo to be incorporated as the featured person/logo -- do not describe a generic stand-in face if a real one will be composited in.`;
  } else if (photoUrls.length > 1) {
    photoInstruction = `\nIMPORTANT: The user uploaded ${photoUrls.length} real reference photos that will be used as reference images during generation. gpt-image-2 needs EXACT positioning instructions for multi-person layouts, not vague placement -- be precise: state the exact arrangement (e.g. "evenly spaced horizontal row" or "left and right with equal scale"), the exact framing for each (e.g. "head-and-shoulders portrait, same crop height for all"), the exact eye-line alignment (e.g. "all faces aligned to the same horizontal eye-line"), and the exact scale relationship (e.g. "identical size, no one larger than another unless seniority is being shown"). Reference each photo by its number explicitly: "Reference Image 1 positioned [X], Reference Image 2 positioned [Y]." Restate that each face must be preserved exactly as uploaded. Do not describe generic stand-in faces.`;
  }

  // Universal outfit preference -- applies to ANY category where a real
  // photo was uploaded and the user was asked keep-vs-upgrade. Read
  // directly from session since this is no longer wedding-only.
  if (photoUrls.length > 0 && session.outfit_preference) {
    const pref = session.outfit_preference.toLowerCase();
    if (pref.includes('keep')) {
      photoInstruction += `\nOUTFIT RULE: the user asked to KEEP their exact outfit from the uploaded photo -- do NOT change clothing, do NOT upgrade attire. Only change the background and add design elements around the person exactly as they appear.`;
    } else {
      photoInstruction += `\nOUTFIT RULE: the user asked to UPGRADE the outfit to suit the flyer style -- replace clothing with attire appropriate for this design (formal wear, traditional wear, business attire, etc. as fits the genre) while keeping the face exactly preserved.`;
    }
  }

  const phraseInstruction = isPersonal
    ? `STEP A -- SELECT a phrase: pick ONE phrase from the NIGERIAN PHRASES list below that best fits the sender's recorded words, and personalize it with the real recipient name.\n\n`
    : '';

  const systemPrompt = `${DESIGNER_LOGIC_PHILOSOPHY}

GENRE FOR THIS REQUEST: ${genreGuidance}
${researchBlock}

YOUR TASK:
${phraseInstruction}STEP ${isPersonal ? 'B' : 'A'} -- PERSONALIZE: if STRUCTURED DETAILS are provided, those are real facts -- use them exactly, verbatim, prominently in both the caption and the image prompt's text instructions. Never substitute a generic placeholder when a real value was given. Extract emotional tone from the sender's recorded words.

STEP ${isPersonal ? 'C' : 'B'} -- BUILD THE IMAGE PROMPT: apply the design philosophy and the genre guidance above. Describe the specific composition you've decided on (what is the hero typographic element, what is the colour story, how is photographic depth achieved, where do the real structured facts appear and in what kind of element). Be concrete and specific -- name actual layout decisions, not vague adjectives. If structured details exist, explicitly instruct the image model to render those exact real values as legible text in the composition. Follow the IMAGE PROMPT STRUCTURE from principle 9 above: subject → setting → lighting (named source and direction) → lens/composition → text elements in "quotes" or ALL CAPS → one tone word. Square 1080x1080 format.${photoInstruction}

STEP ${isPersonal ? 'D' : 'C'} -- WRITE THE CAPTION: 2 sentences max, Nigerian Pidgin, include the recipient/business/candidate name and any key real detail.

FINAL CHECK BEFORE YOU WRITE THE IMAGE PROMPT -- THIS OVERRIDES EVERYTHING ELSE IF THERE IS ANY CONFLICT:
Read back your own imagePrompt and ask: does this sound like a generic stock-photo ad template, or does it sound like real work from a senior Nigerian designer who was specifically briefed on this exact request? If it leans generic at all, rewrite it -- sharpen the typographic hero, commit to one disciplined colour story, add real Nigerian texture and cinematic warmth. Never settle for "clean and readable" as the finish line -- that is the minimum, not the goal.

Return ONLY valid JSON:
{
  "caption": "your personalized Nigerian Pidgin caption",
  "imagePrompt": "your complete detailed image generation prompt"
}`;

  const userPrompt = `CONTEXT:
${context}
${structuredDetails}
Category: ${category}
${phraseBlock}
Follow your task steps and return the JSON.`;

  const response = await client.chat.completions.create({
    model: 'gpt-5.5',
    max_tokens: 1800,
    temperature: 0.85,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
  });

  const result = JSON.parse(response.choices[0].message.content);
  return {
    caption: result.caption,
    imagePrompt: result.imagePrompt,
  };
}

module.exports = { generateCaptionAndImagePrompt, STRUCTURED_FIELD_LABELS };
