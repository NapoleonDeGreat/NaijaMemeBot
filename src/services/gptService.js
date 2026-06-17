const OpenAI = require('openai');
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// =============================================
// CATEGORY INTELLIGENCE LAYER
// GPT SELECTS from concrete named options below,
// then personalizes using real structured details
// (church name, venue, business name, etc.) where
// available, plus the voice transcript for flavor.
// =============================================

const INTELLIGENCE = {

  thank_you: {
    archetypes: [
      { id: 'excited_uncle', desc: 'A heavyset Nigerian uncle in his 50s, traditional Igbo red cap and lion print agbada, fist pumping in the air, mouth wide open screaming with joy, holding phone showing credit alert notification' },
      { id: 'market_woman', desc: 'A confident middle-aged Nigerian market woman in bright ankara wrapper and head tie, hands raised to the sky in gratitude, tears of joy on her cheeks, market stalls behind her' },
      { id: 'rich_auntie', desc: 'A glamorous Nigerian aunty in her 40s, full lace wig, glittering aso-ebi, covering her mouth in dramatic shock and joy, indoor party setting with fairy lights' },
      { id: 'young_hustler', desc: 'A young Nigerian man in his 20s, white polo shirt, gold chain, jumping in the air with both fists raised, pure celebration energy, urban Lagos street background' },
      { id: 'proud_mama', desc: 'A Nigerian mother in Sunday best wrapper and blouse, pressing hand to chest in deep gratitude, gentle tears, warm home living room background' },
    ],
    scenarios: [
      'Just received credit alert from recipient -- amount changed their life today',
      'Customer finally paid their debt after long time -- business owner overwhelmed',
      'Someone paid rent or school fees -- family celebration breaking out',
      'Unexpected financial help arrived at darkest moment',
      'Loyal customer returned after long absence -- shop owner emotional',
    ],
    scenes: [
      'credit alert notification glowing on phone screen',
      'market stall decorated with customer thank you banner',
      'family compound celebration with neighbours watching',
      'shop front with "God bless you" chalked on board',
      'church pew with grateful worshipper',
    ],
    phrases: [
      'Na you do pass! God go bless you well well',
      'You too much! I no fit express am for mouth',
      'See as you take save my life today -- God bless your hustle',
      'E be like say God send you -- thank you die',
      'You spoil me! I go always remember this day',
      'My person! You never disappoint -- na loyalty be this',
      'Omo, you dey show love anyhow -- I appreciate you die',
      'This one wey you do for me -- heaven go remember you',
    ],
  },

  customer_appreciation: {
    archetypes: [
      { id: 'shop_owner_proud', desc: 'A proud Nigerian shop owner in smart ankara shirt, standing behind counter lined with products, warm genuine smile, hands open in welcome gesture, well-lit modern shop interior' },
      { id: 'restaurant_owner', desc: 'A Nigerian restaurant owner in chef whites with ankara trim, arms crossed with pride in front of steaming pot display, warm kitchen lighting, "customer is king" energy' },
      { id: 'market_trader_grateful', desc: 'A Nigerian market trader woman in bright wrapper, sitting at stall stacked with goods, pressing both hands together in appreciation, smiling directly at camera' },
      { id: 'business_boss', desc: 'A confident young Nigerian entrepreneur in sharp suit, Lagos skyline behind through office window, holding company branded item, genuine warm smile' },
      { id: 'tailor_artisan', desc: 'A Nigerian tailor in her shop surrounded by colourful fabrics, holding up a beautifully made garment, beaming smile, appreciation and craft pride combined' },
    ],
    scenarios: [
      'Loyal customer who has been buying for 1 year -- owner overwhelmed with gratitude',
      'Customer referred 5 new people to the business -- public appreciation post',
      'Customer left 5-star review online -- business owner celebrating publicly',
      'Customer who supported during hard times finally coming back',
      'New customer who drove far distance specifically for this business',
    ],
    scenes: [
      'Nigerian shop front with customer appreciation banner boldly displayed, business logo prominent',
      'WhatsApp business screenshot showing "5 stars" customer review',
      'Market stall with cheerful "Thank You Customer" hand-painted sign',
      'Restaurant table with loyal customer seated, owner presenting food personally',
      'Business card exchange moment between proud owner and happy customer',
    ],
    phrases: [
      'Oga/Madam [NAME], na you be our MVP -- God bless you!',
      'Customer like you na why we dey open shop every morning',
      'Your loyalty dey make our business shine -- e no go pass you',
      'We see you, we appreciate you -- [NAME] you too much!',
      'Na people like [NAME] wey dey make business sweet -- thank you die',
      'Your support carry us -- God go reward you plenty',
      'Since day one you never disappoint -- we dey celebrate you today',
      '[NAME], you be the reason why we no give up -- e no go pass you',
    ],
  },

  congratulations: {
    archetypes: [
      { id: 'proud_graduate', desc: 'A young Nigerian graduate in academic gown and mortarboard, certificate held high overhead, huge smile, family members cheering behind them, golden hour campus setting' },
      { id: 'new_parent', desc: 'A Nigerian couple beaming with joy, husband in agbada, wife in aso-ebi, holding a newborn wrapped in colourful cloth, hospital or home setting' },
      { id: 'promotion_winner', desc: 'A sharp Nigerian professional in corporate attire, holding letter of promotion, fist raised, modern office background with colleagues applauding behind' },
      { id: 'celebration_family', desc: 'A whole Nigerian family -- three generations -- in matching ankara fabric, arms around each other, confetti falling, outdoor compound celebration' },
      { id: 'new_car_owner', desc: 'A young Nigerian man or woman standing proud beside brand new car with ribbon on bonnet, keys raised, car dealership or home compound setting' },
    ],
    scenarios: [
      'NYSC posting just received -- family celebrating posting letter',
      'University first class result announced -- compound celebration erupting',
      'Job offer letter received after months of searching',
      'New baby born -- family compound celebration breaking out',
      'Business registration complete -- entrepreneur celebrating new chapter',
    ],
    scenes: [
      'Confetti explosion over celebrating Nigerian family in matching outfits',
      'NYSC call-up letter framed and held up proudly',
      'Graduation photo moment with crying proud mother',
      'Car ribbon cutting ceremony with family cheering',
      'WhatsApp screenshot of congratulations messages flooding in',
    ],
    phrases: [
      '[NAME] you don make am! God wey start this go finish am well',
      'From struggle to glory -- e no easy but you do am!',
      'Omo see as God show up for [NAME] -- congratulations die!',
      'Your time don reach -- nothing go stop you again!',
      'We always know say [NAME] go shine -- today na proof!',
      'Every prayer, every hustle -- e don pay! Congratulations!',
      '[NAME] level don change -- e no go pass you!',
      'Today na testimony day for [NAME] -- God too faithful!',
    ],
  },

  apology: {
    archetypes: [
      { id: 'remorseful_man', desc: 'A Nigerian man in his 30s in simple traditional attire, hands clasped together in genuine prayer and apology, eyes cast slightly down with real sorrow, soft dramatic lighting' },
      { id: 'kneeling_woman', desc: 'A Nigerian woman in casual home clothes, hand on chest, eyes full of sincere vulnerability, soft indoor lighting, the kind of apology that comes from the heart' },
      { id: 'dramatic_uncle', desc: 'An older Nigerian man in traditional agbada, prostrating dramatically in apology, half-humorous half-sincere energy, outdoor compound setting' },
      { id: 'young_couple', desc: 'A young Nigerian man in his 20s, one knee almost down, flowers in hand, expression of pure regret and hope, romantic soft bokeh background' },
    ],
    scenarios: [
      'Big fight with partner -- apology after 3 days of silence',
      'Missed important family event -- asking for forgiveness from mama',
      'Business disagreement with loyal customer -- making it right',
      'Forgotten birthday -- emergency apology the morning after',
      'Said something hurtful in anger -- wanting to fix it properly',
    ],
    scenes: [
      'Lone figure at door with humble posture, warm indoor light visible inside',
      'Hand-written note visible beside flowers and small gift',
      'Two people almost reconciling -- space between them closing',
      'Prostration before elder -- traditional Yoruba apology energy',
      'Phone screen showing unsent message -- frozen in regret',
    ],
    phrases: [
      'I mess up, I know -- but my love for [NAME] never change',
      'No fine words -- I just want [NAME] to forgive me',
      'I sorry die -- [NAME] please na, I no go do am again',
      'This one pain me too -- I never mean to hurt [NAME]',
      'I been wrong, I admit am -- [NAME] you too important to lose',
      'Forgive me [NAME] -- I promise say things go change',
      'I no fit sleep well since -- [NAME] please hear me out',
    ],
  },

  ask_money: {
    archetypes: [
      { id: 'charming_beggar', desc: 'A young Nigerian in casual clothes, both hands outstretched in pleading gesture, eyes wide with hopeful humor, slight smile that says "I know how this looks", street background' },
      { id: 'market_woman_pleading', desc: 'A Nigerian market woman in bright wrapper, dramatically pressing palms together in prayer-plea, exaggerated expression mixing desperation and humor, market stall background' },
      { id: 'broke_student', desc: 'A Nigerian university student in school uniform, empty pockets turned inside out, sad-funny expression, campus background, the universal broke student energy' },
      { id: 'hustler_entrepreneur', desc: 'A young Nigerian entrepreneur with business idea notebook, urgent expressive face, Lagos hustle energy, the "this investment will change both our lives" look' },
    ],
    scenarios: [
      'End of month, rent due tomorrow -- emergency ask',
      'Business opportunity that expires today -- investor pitch to friend',
      'School fees deadline in 48 hours -- student reaching out',
      'Stranded far from home -- transportation emergency',
      'Medical situation requiring urgent funds',
    ],
    scenes: [
      'Empty wallet dramatically open showing nothing inside',
      'Phone screen showing bank balance of near-zero',
      'Deadline notice on wall with urgent underlines',
      'Food pot that is empty -- hunger has arrived',
      'Business plan notebook held open hopefully',
    ],
    phrases: [
      '[NAME] I know say I get liver -- but na only you I fit ask',
      'My person, I no want beg but situation don push me -- help me',
      'I promise I go pay back -- [NAME] na you be my last resort',
      'God go bless you if you help [NAME] right now -- e dey urgent',
      'I no go forget this one -- [NAME] please na, just this once',
      'My situation bad bad -- [NAME] you be my miracle today',
      'I dey come to you because I know say your heart dey -- help me [NAME]',
    ],
  },

  relationship: {
    archetypes: [
      { id: 'lovesick_young_man', desc: 'A handsome young Nigerian man in his 20s in smart casual wear, hand over heart, eyes full of genuine longing and hope, Lagos city lights bokeh background, Nollywood romantic energy' },
      { id: 'confident_woman', desc: 'A beautiful Nigerian woman in elegant casual outfit, slight confident smile, eyes that say "I know what I want", warm indoor setting, bold energy' },
      { id: 'shy_admirer', desc: 'A young Nigerian in simple clean clothes, looking slightly away then back at camera, the look of someone who has rehearsed this speech for weeks, outdoor setting' },
      { id: 'dramatic_proposal', desc: 'A Nigerian man in traditional attire, one knee close to ground, expressive face, romantic gesture, warm evening light, the whole Nollywood romantic scene' },
    ],
    scenarios: [
      'Shooting shot at crush who does not know they exist yet',
      'Confessing feelings after months of friendship',
      'Winning back ex after separation',
      'Valentine or special occasion confession',
      'Long-distance love declaration',
    ],
    scenes: [
      'Rooftop Lagos sunset with city lights beginning to glow below',
      'Single red rose against warm bokeh background',
      'Phone notification showing unread messages -- building courage to reply',
      'Two shadows approaching each other on a bridge',
      'Nollywood-style romantic outdoor setting, golden hour',
    ],
    phrases: [
      '[NAME] since I see you my heart never rest -- make I be your person',
      'I no dey good with plenty words -- but I know say I want [NAME] for life',
      '[NAME] you be the one wey dey scatter my brain in a good way',
      'I don carry this feeling too long -- [NAME] answer me',
      'God create [NAME] special -- and I want to be the one to say thank you daily',
      '[NAME] my heart dey do anyhow when you dey around -- that means something',
      'I fit love plenty people but [NAME] na different thing entirely',
    ],
  },

  church: {
    archetypes: [
      { id: 'anointed_pastor', desc: 'A Nigerian pastor in white Sunday attire with golden details, hands raised in worship, eyes closed in spiritual ecstasy, golden rays of light from above, powerful anointed energy' },
      { id: 'choir_member', desc: 'A Nigerian choir member in purple and gold robes, mouth open in praise, eyes shut, both hands raised, church lights and cross visible behind' },
      { id: 'grateful_worshipper', desc: 'An older Nigerian church woman in elegant Sunday hat and aso-oke, tears of joy streaming, hands pressed together in deep prayer, front pew setting' },
      { id: 'youth_pastor', desc: 'A young Nigerian youth pastor in smart casual with clerical collar, modern church background, vibrant energy, relatable and fire-filled' },
    ],
    scenarios: [
      'Sunday service announcement for special programme',
      'Testimony of miracle received after long prayer',
      'Church anniversary celebration flyer',
      'Crusade or revival event announcement',
      'New Year or Easter special service',
    ],
    scenes: [
      'Church auditorium filled with raised hands during worship, programme banner with theme and date prominently displayed',
      'Cross glowing with warm golden rays, dramatic church lighting, church name and venue clearly shown',
      'Outdoor crusade ground at night with masses gathered, event details banner visible',
      'Church banner unfurling with powerful programme title, date, time and venue in bold text',
      'Prayer mountain at sunrise -- solitary worshipper silhouette',
    ],
    phrases: [
      'God show up again -- testimony time at [CHURCH NAME]',
      'Come and receive your miracle -- the Lord is here',
      'This programme go change your story forever -- do not miss it',
      'Heaven dey back this programme -- come and see',
      'Your season of testimony don reach -- join us',
      'The anointing dey flow -- be there in person',
    ],
  },

  business_advert: {
    archetypes: [
      { id: 'confident_ceo', desc: 'A sharp Nigerian entrepreneur in tailored suit or smart ankara, arms crossed, Lagos skyline or modern office behind, the look of someone who built something real' },
      { id: 'market_seller_proud', desc: 'A Nigerian market trader proudly displaying products -- fresh food, fabric, electronics -- confident hands-on-hip pose, stall beautifully arranged' },
      { id: 'delivery_hustler', desc: 'A young Nigerian dispatch rider in branded vest on motorbike, helmet off, big confident smile, Lagos traffic visible behind, hustle energy' },
      { id: 'fashion_designer', desc: 'A Nigerian fashion designer holding up stunning garment creation, tailor shop background, pride of craft visible, modern Naija fashion energy' },
    ],
    scenarios: [
      'New product launch -- announcing to market',
      'Promo or discount -- limited time offer urgency',
      'Business re-opening after expansion or renovation',
      'Anniversary sale celebration with customers',
      'New service or delivery area launch',
    ],
    scenes: [
      'Shop front with bold OPEN signage, business name and logo prominent, smiling owner',
      'Product display laid out professionally with price tags and offer details visible',
      'Before-and-after transformation showing business growth',
      'Delivery unboxing moment -- customer excitement, contact info displayed',
      'WhatsApp order message screenshot with ORDER NOW energy, contact number bold',
    ],
    phrases: [
      'We dey give you the best -- come and see for yourself',
      'Quality no dey lie -- [BUSINESS] don prove am since day one',
      'Order now before stock finish -- e dey go fast fast',
      'Your satisfaction na our prayer -- try us today',
      'Lagos best kept secret -- [BUSINESS] has arrived',
      'We no dey close until your order don sort -- call us now',
      'See quality, feel quality -- [BUSINESS] na different level',
    ],
  },

  political: {
    archetypes: [
      { id: 'rallying_candidate', desc: 'A Nigerian political candidate in traditional agbada or babariga, fist raised to the sky, crowd energy behind them, Nigerian flag colours in background, hope and power combined' },
      { id: 'community_leader', desc: 'A respected Nigerian community figure in traditional chief attire, seated but powerful, council of elders energy behind them, wisdom and authority visible' },
      { id: 'youth_candidate', desc: 'A young Nigerian political candidate in smart-casual with party colours, vibrant energy, modern campaign poster aesthetic, "new Nigeria" energy' },
    ],
    scenarios: [
      'Campaign rally announcement for next weekend',
      'Election day mobilisation -- vote for our candidate',
      'Policy promise announcement with accountability energy',
      'Ward meeting or community townhall invitation',
      'Victory celebration after election result',
    ],
    scenes: [
      'Massive rally ground with sea of supporters in party colours, candidate name and position bold across banner',
      'Candidate shaking hands with market trader -- grassroots energy, slogan visible',
      'Nigerian flag waving over crowd at sunset, election date prominent',
      'Ballot box moment -- civic duty energy',
      'Community project commissioned -- promises kept, candidate name and slogan featured',
    ],
    phrases: [
      'The change wey we need don reach -- vote [NAME]',
      'Our community dey first -- [NAME] go make am happen',
      'New chapter, new leadership -- [NAME] for the people',
      'We don wait long enough -- time to act, vote [NAME]',
      'Your vote na your voice -- use am for [NAME]',
      '[NAME] na one of us -- e understand our struggle',
    ],
  },

  academic: {
    archetypes: [
      { id: 'first_class_graduate', desc: 'A young Nigerian university graduate in academic gown and mortarboard, first class certificate held high, huge smile, proud parents visible behind wiping tears, campus golden hour' },
      { id: 'nysc_corps_member', desc: 'A Nigerian NYSC corps member in white khakis with green and white trim, call-up letter held up, mixture of excitement and nerves, NYSC camp gate visible' },
      { id: 'waec_star', desc: 'A Nigerian secondary school student in uniform, result slip held up showing As and Bs, screaming with joy, school gate background, parents rushing toward them' },
      { id: 'admission_winner', desc: 'A young Nigerian holding JAMB or university admission letter, phone screenshot of result visible, family gathering behind, first person in family to get admission energy' },
    ],
    scenarios: [
      'First class degree result -- family compound celebration',
      'JAMB admission letter received -- scholarship announcement',
      'NYSC call-up letter -- posting to desired state',
      'WAEC/NECO distinction results released',
      'Scholarship abroad awarded -- community celebrating',
    ],
    scenes: [
      'Academic certificate framed and held up on graduation day, school name and achievement clearly shown',
      'NYSC khaki uniform first wear -- family photo moment',
      'Results notification on JAMB portal -- screenshot moment, achievement and date featured',
      'University gate in background -- orientation day arrival, school name visible',
      'Library study session that finally paid off -- books and result letter together',
    ],
    phrases: [
      '[NAME] you don show them -- first class no be small thing!',
      'From night classes to glory -- [NAME] you deserve am!',
      'This result na proof say hardwork pay -- [NAME] we proud die!',
      'Mama tears don flow -- [NAME] you do am for the family!',
      'From lesson teacher wahala to first class -- God too faithful!',
      '[NAME] you don silence every doubt -- congratulations!',
      'The hustle was real but [NAME] never give up -- e pay today!',
    ],
  },

};

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
  },
  business_advert: {
    business_name: 'Business name',
    offer_product: 'Offer/Product',
    contact_info: 'Contact info',
  },
  customer_appreciation: {
    business_name: 'Business name',
    offer_product: 'What the customer is being appreciated for',
    contact_info: 'Contact info',
  },
  political: {
    candidate_name: 'Candidate name',
    position_title: 'Position contesting for',
    party_slogan: 'Party/Slogan',
    election_date: 'Election date',
  },
  academic: {
    school_name: 'School/Institution name',
    achievement_name: 'Achievement/Event name',
    achievement_date: 'Date',
  },
};

async function generateCaptionAndImagePrompt(session) {
  const {
    category,
    recipient_name: recipientName,
    voice_transcript: voiceTranscript,
    notes,
    gender,
    photo_url: photoUrl,
  } = session;

  const intel = INTELLIGENCE[category] || INTELLIGENCE.thank_you;

  const archetypeList = intel.archetypes
    .map((a, i) => `${i + 1}. [${a.id}] ${a.desc}`)
    .join('\n');

  const scenarioList = intel.scenarios
    .map((s, i) => `${i + 1}. ${s}`)
    .join('\n');

  const sceneList = intel.scenes
    .map((s, i) => `${i + 1}. ${s}`)
    .join('\n');

  const phraseList = intel.phrases
    .map((p, i) => `${i + 1}. ${p}`)
    .join('\n');

  // Build the structured-details block, if this category collects any
  const fieldMap = STRUCTURED_FIELD_LABELS[category];
  let structuredDetails = '';
  if (fieldMap) {
    const lines = Object.entries(fieldMap)
      .map(([col, label]) => (session[col] ? `${label}: ${session[col]}` : null))
      .filter(Boolean);
    if (lines.length > 0) {
      structuredDetails = `\nSTRUCTURED DETAILS PROVIDED BY USER (use these exact real values -- do not invent placeholder values when these are present):\n${lines.join('\n')}\n`;
    }
  }

  const context = [
    `Recipient name: ${recipientName}`,
    gender ? `Recipient gender: ${gender}` : null,
    voiceTranscript ? `What the sender recorded/typed: "${voiceTranscript}"` : null,
    notes ? `Extra notes: ${notes}` : null,
  ].filter(Boolean).join('\n');

  const photoInstruction = photoUrl
    ? `\nIMPORTANT: The user uploaded a real photo (of themselves, their pastor, candidate, or business logo) that will be used as a reference image during generation. Write the image prompt so it makes sense for a real reference photo to be incorporated as the featured person/logo -- do not describe a generic stand-in face if a real one will be composited in, but you should still select an archetype for pose/setting/styling context.`
    : '';

  const systemPrompt = `You are Nigeria's most creative meme and flyer director. Your job is to create designs that feel like they were made by a professional Lagos graphic designer -- specific, Nigerian, emotionally sharp, and shareable.

THE RULE: You do NOT invent from scratch. You SELECT from the options given, then personalize them using the real structured details and the sender's own words.

CRITICAL DESIGN STANDARD -- match this exact level of visual density, not a simplified version of it:

The reference standard is a real photo-real scene with AT LEAST 5-6 distinct graphic elements composited on top, each with its OWN background shape, its OWN icon or visual accent, and positioned at a DIFFERENT spot and angle (not all centered, not all the same size, not all neatly stacked in a column). Specifically include, by name, in the image prompt:

1. A brand/business header lockup in a corner (logo wordmark + small tagline beneath it, e.g. top-right or top-left corner)
2. A white or light rounded "notification card" or "info card" element with its own small icon (checkmark circle, bell, money bag, calendar icon etc.) and 2-3 lines of text in different weights/colours within that one card -- positioned off-center, NOT in the middle of the image
3. Small hand-drawn sparkle/motion lines or burst accents near at least one element for energy
4. A comic-style speech bubble with a visible tail pointing toward the main subject's mouth, mixing bold and regular text weight, containing the personalized phrase
5. A rough-edged "paint stroke" or torn-paper style colour-block banner (not a clean rectangle) containing 2-3 lines of bold text in at least two different colours
6. A bottom strip or secondary chip with 3-4 small icon+label pairs (e.g. checkmarks, truck/delivery icon, contact/headset icon, location pin) OR a second small accent chip with its own icon and short text

Explicitly instruct the image model to vary the SIZE, ANGLE, and POSITION of these elements -- some larger, some smaller, some slightly rotated, overlapping the photo at different depths -- rather than evenly spaced or centered. The result should feel busy, layered, and "lived in" like a real Nigerian social media ad screenshot, not like a clean evenly-spaced template. Reuse real icons/emoji-style glyphs (checkmarks, bells, money bags, location pins, phone icons) inside the card/banner elements themselves, not just as decoration floating separately.

STEP 1 -- SELECT (pick the best fit for the context):
- Pick ONE character archetype from the list
- Pick ONE scenario from the list
- Pick ONE scene detail from the list
- Pick ONE phrase from the list (replace [NAME]/[CHURCH NAME]/[BUSINESS] with the actual real value provided)

STEP 2 -- PERSONALIZE (use the real structured details first, sender's words second):
- If STRUCTURED DETAILS are provided above, those are real facts (real church name, real date, real venue, real business name, etc.) -- use them exactly, verbatim, prominently in both the caption and the image prompt's text overlay instructions. Never substitute a generic placeholder when a real value was given.
- Extract emotional flavor from the sender's recorded words for tone and personality
- Make the recipient's name (or candidate/business name) prominent and natural

STEP 3 -- BUILD THE IMAGE PROMPT:
- Start with the selected archetype description
- Add the selected scene detail
- Write out all 6 elements from the CRITICAL DESIGN STANDARD above by name and describe each one's content, icon, position, and rough size relative to the frame -- do not skip any of the 6, and do not let them default to evenly-spaced or centered placement
- If structured details exist (church name, date, time, venue, business name, candidate name, etc.), explicitly instruct the image model to render those exact real values as bold legible text in the composition -- spell them out verbatim in the prompt, distributed across the relevant elements (e.g. date/time/venue in the bottom banner, business name in the header lockup, contact info in a small chip)
- Specify: vibrant Nigerian colour palette, cinematic lighting, ultra realistic photography style, professional Nigerian graphic design quality, 1080x1080 square format
- All text in the image must be BOLD, large enough to read clearly, and laid out like a real busy Nigerian social media ad -- varied angles and overlapping depth, not a clean symmetrical template
${photoInstruction}

STEP 4 -- WRITE THE CAPTION:
- 2 sentences max
- Nigerian Pidgin
- Include recipient name and, where relevant, the key real detail (amount, business name, date, achievement)
- Based on the selected phrase but personalized

Return ONLY valid JSON:
{
  "selectedArchetype": "archetype id you chose",
  "selectedScenario": "scenario number you chose",
  "caption": "your personalized Nigerian Pidgin caption",
  "imagePrompt": "your complete detailed image generation prompt"
}`;

  const userPrompt = `CONTEXT:
${context}
${structuredDetails}
Category: ${category}

CHARACTER ARCHETYPES (pick one):
${archetypeList}

SCENARIOS (pick one):
${scenarioList}

SCENE DETAILS (pick one):
${sceneList}

NIGERIAN PHRASES (pick one, personalize with real names/values):
${phraseList}

Select, personalize, and return the JSON.`;

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 1800,
    temperature: 0.8,
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
