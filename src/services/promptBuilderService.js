const OpenAI = require('openai');
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ══════════════════════════════════════════════════════════════════
// MUSIC DNA SYSTEM
// Every genre has: sunoTags, negativeTags, lyricStyle, vibe
// sunoTags  → passed directly as Suno "tags" field
// negativeTags → passed as Suno "negative_tags" to avoid generic AI sound
// lyricStyle → tells GPT exactly how to write for this genre
// vibe → human description used in GPT prompt
// ══════════════════════════════════════════════════════════════════

const MUSIC_DNA = {

  // ── AFROBEATS ─────────────────────────────────────────────────
  afrobeats: {
    sunoTags: 'Afrobeats, Nigerian pop, log drum, shekere percussion, talking drum, melodic male vocalist, Lagos energy, catchy hook, danceable, 95 BPM, warm bass, radio-ready',
    negativeTags: 'generic pop, Western pop, bland, elevator music, EDM, techno',
    vibe: 'hype celebratory Afrobeats — think street energy meets emotion',
    lyricStyle: `Write in natural Nigerian Pidgin English mixed with occasional English. 
Short punchy lines. Strong rhyme scheme. 
Chorus must be a 4-line hook that people can sing along to after one listen.
Use specific Nigerian expressions: "e don happen", "God don do am", "na you be the one", "we move".
Reference real Nigerian life: Lagos traffic, grinding, God's blessing, hustling paying off.
Zero generic lines. Every line must connect to the person's actual story.`,
  },

  // ── AMAPIANO ──────────────────────────────────────────────────
  amapiano: {
    sunoTags: 'Amapiano, log drum piano stabs, deep bass, groovy, 114 BPM, Nigerian vocalist, melodic, smooth, infectious groove, South African house influence, warm production',
    negativeTags: 'harsh, aggressive, fast rap, heavy metal, rock',
    vibe: 'smooth groovy Amapiano — laid back but deeply infectious',
    lyricStyle: `Write in smooth Nigerian Pidgin or English. 
Flowing melodic lines that match slow groove.
Chorus feels almost like a chant — hypnotic and repetitive in a good way.
Lines about celebrating life, good times, love, or success.
Not too many words per line — space for the melody to breathe.`,
  },

  // ── NAIJA STREET POP ──────────────────────────────────────────
  street_pop: {
    sunoTags: 'Nigerian street pop, raw street energy, trap hi-hats, talking drum, melodic autotune vocals, Pidgin English, punchy bass, catchy hook, 100 BPM, Lagos nightlife, youthful energy',
    negativeTags: 'country, folk, acoustic, classical, old school',
    vibe: 'raw youthful Nigerian street pop — hunger, hustle, and celebration',
    lyricStyle: `Write in raw Nigerian Pidgin. Very street. Very real.
Short sharp lines. Fast delivery implied.
Reference youth culture: grinding, making it, God, streets, flex.
Chorus is short and punchy — 2 to 4 lines maximum, very repeatable.
At least one line should feel like it could trend on TikTok.`,
  },

  // ── PIDGIN + YORUBA MIX ───────────────────────────────────────
  pidgin_mix: {
    sunoTags: 'Afrobeats, Pidgin English verses, Yoruba ad-libs and chorus naturally blended, deep bass, modern Nigerian production, emotional warmth, 95 BPM, soulful male vocals',
    negativeTags: 'generic pop, Western, bland, EDM',
    vibe: 'Pidgin and Yoruba blended naturally like real Lagos music',
    lyricStyle: `Write verses in Nigerian Pidgin. Chorus or key ad-libs in Yoruba.
The Yoruba should feel natural not forced — short cultural phrases, praises, exclamations.
Examples of natural Yoruba insertions: "omo", "e ma worry", "Olorun ti soro" (God has spoken), praise names.
The blend should feel like real Nigerian music, not two languages fighting each other.`,
  },

  // ── IGBO HIGHLIFE + OGENE ─────────────────────────────────────
  igbo_highlife: {
    sunoTags: 'Igbo highlife, ogene metallic percussion, traditional Anambra rhythm, call and response vocals, acoustic guitar, festive Igbo energy, Onitsha sound, rich percussion, celebratory',
    negativeTags: 'Western pop, rap, trap, EDM, generic',
    vibe: 'authentic Igbo highlife with ogene — festive and deeply cultural',
    lyricStyle: `Write in authentic Igbo. Include real Igbo proverbs and praise names.
Structure for ogene call-and-response: short call line, short response line.
Examples of authentic elements:
- Praise names: "Nna m" (my father), "Nne m" (my mother), "Eze" (king/chief)
- Proverbs: "Onye wetara oji wetara ndu" (one who brings kola brings life)
- Exclamations: "Chineke!", "Isee!", "O dị mma!"
Chorus should be a short repeatable Igbo phrase people can chant.
Keep lines short to match ogene call-and-response rhythm.`,
  },

  // ── PIDGIN + IGBO FUSION ──────────────────────────────────────
  pidgin_igbo: {
    sunoTags: 'Afrobeats fusion, Pidgin English verses, Igbo chorus and ad-libs naturally blended, ogene percussion underneath modern beat, emotional, southeastern Nigeria sound, 95 BPM, heartfelt vocals',
    negativeTags: 'generic pop, Western, bland, harsh',
    vibe: 'Pidgin verses with Igbo chorus — modern southeastern sound',
    lyricStyle: `Write verses in Nigerian Pidgin. Chorus in Igbo with natural Pidgin ad-libs.
The Igbo chorus should include at least one real Igbo proverb or praise expression.
Example flow: Pidgin verse tells the story → Igbo chorus celebrates or reflects.
Make the cultural blend feel like it came from someone from Enugu or Anambra living in Lagos.`,
  },

  // ── YORUBA JUJU / PRAISE ──────────────────────────────────────
  yoruba_juju: {
    sunoTags: 'Yoruba juju music, talking drum dundun, guitar, traditional Nigerian, oriki praise singing, rich percussion, call and response, Yoruba male vocalist, celebratory, cultural depth',
    negativeTags: 'rap, trap, EDM, Western pop, generic AI vocals',
    vibe: 'traditional Yoruba juju praise singing with oriki',
    lyricStyle: `Write in proper Yoruba. This is oriki — praise poetry.
Structure: praise the person, list their qualities and lineage, call on blessings.
Use Yoruba cultural expressions naturally:
- "Omo adun" (sweet child), "Olowo ori mi" (my crown), "E jowo" (please/blessings)
- Reference Yoruba towns, families, or cultural identity if person mentions it
Repeat the person's name naturally in praise.
The rhythm should feel like a griot singing someone's praises.`,
  },

  // ── GOSPEL ───────────────────────────────────────────────────
  gospel: {
    sunoTags: 'Nigerian gospel, powerful choir backing vocals, uplifting piano, worship drums, Afro-gospel, passionate Nigerian vocalist, thanksgiving theme, atmospheric, emotional build, 75 BPM',
    negativeTags: 'rap, aggressive, fast, trap, street, party',
    vibe: 'powerful slow Nigerian gospel worship — emotional and spirit-filled',
    lyricStyle: `Write in Nigerian Pidgin English mixed with English.
This is worship — intimate, grateful, powerful.
Reference God's faithfulness, testimony, answered prayer.
Use real Nigerian gospel expressions: "God you too good", "na you do am", "I lift my hands".
Chorus should be a prayer or declaration people can sing in church.
Include at least one verse that tells a specific testimony or story of breakthrough.
Avoid clichés. Every line should feel genuine and personal.`,
  },

  // ── DEEP WORSHIP ──────────────────────────────────────────────
  deep_worship: {
    sunoTags: 'Nigerian deep worship, slow atmospheric piano, ambient strings, breathy intimate vocals, very slow 60 BPM, spiritual depth, Theophilus Sunday style sound, reverent, emotional, minimalist production',
    negativeTags: 'fast, upbeat, rap, party, aggressive, loud',
    vibe: 'slow intimate Nigerian deep worship — Theophilus Sunday atmosphere',
    lyricStyle: `Write in English with occasional Pidgin or Yoruba/Igbo worship phrases.
This is intimate prayer set to music. Very slow, very personal.
Lines should feel like someone is alone with God.
Reference: surrender, peace, dwelling in God's presence, being overwhelmed by love.
Structure: long flowing lines, not short punchy bars.
Chorus is a simple repeated declaration: "You are enough", "I surrender all", "Nothing else matters".
Think Theophilus Sunday, Nathaniel Bassey slow worship.`,
  },

  // ── GOSPEL CHANTS ─────────────────────────────────────────────
  gospel_chant: {
    sunoTags: 'Nigerian gospel chant, Lawrence Oyor style, traditional African chanting, call and response congregation, drumming, organic percussion, spiritual depth, repetitive blessing chant, powerful',
    negativeTags: 'pop, EDM, Western, synthesizer-heavy, generic',
    vibe: 'Nigerian gospel chant — Lawrence Oyor congregation feel',
    lyricStyle: `Write in a mix of English, Pidgin and Yoruba/Igbo chant phrases.
This is repetitive and hypnotic by design — like a church chant or chorus everyone joins.
Short lines, repeated with variations.
Call: "God is good!" Response: "All the time!"
Include real African church chant patterns.
Reference scripture naturally, not formally.
Should feel like 500 people in a church joining in together.`,
  },

  // ── PRAISE ────────────────────────────────────────────────────
  gospel_praise: {
    sunoTags: 'Nigerian praise music, upbeat gospel, Prince Emmanuel style, energetic choir, praise and worship drums, exciting trumpet, joyful, celebration, 110 BPM, clapping congregation feel',
    negativeTags: 'slow, sad, dark, rap, street, party',
    vibe: 'energetic Nigerian praise — Prince Emmanuel church celebration feel',
    lyricStyle: `Write in Pidgin English and English, joyful and celebratory.
This is praise — loud, grateful, excited.
Reference God's goodness, victories, answered prayers.
Lines should make people want to clap and dance.
Chorus should be a shout of praise: "God you are great!", "Lift up holy hands!".
Include specific testimonies of breakthrough, healing, promotion.
Energy should feel like a church about to erupt in celebration.`,
  },

  // ── CHRISTIAN RAP (ECG STYLE) ─────────────────────────────────
  christian_rap: {
    sunoTags: 'Christian hip hop, Nigerian gospel rap, spoken word testimony bars, trap beats with church choir underneath, Pidgin English bars, faith theme, inspirational, ECG style sound, powerful delivery',
    negativeTags: 'secular, party, club, explicit, generic rap',
    vibe: 'Nigerian Christian rap — ECG style testimony bars',
    lyricStyle: `Write in Nigerian Pidgin English bars. This is Christian rap not soft gospel.
Hard hitting bars with real content: testimony, faith struggle, breakthrough, God's grace.
Rap verse: tell a real story of struggle and how God came through.
Hook/Chorus: melodic, singable, declaration of faith.
Use real Pidgin street language but directed toward faith.
Examples: "I been down but God lift me", "dem say I no go make am but God said otherwise".
Zero clichés. Make it sound like a real person's testimony rapped.`,
  },

  // ── NAIJA STREET RAP ──────────────────────────────────────────
  naija_rap: {
    sunoTags: 'Nigerian street rap, fast aggressive Pidgin English flow, heavy 808 bass, Afrobeats percussion, trap hi-hats, raw Lagos energy, hard hitting bars, rapid delivery, street credibility',
    negativeTags: 'soft, slow, gospel, church, acoustic, country',
    vibe: 'hard Nigerian street rap — raw Lagos Pidgin bars',
    lyricStyle: `Write in raw aggressive Nigerian Pidgin. Very street. Very fast.
Hard bars. Real talk. Reference hustle, streets, grinding, success, proving doubters wrong.
Rhyme scheme must be tight — AABB or ABAB, consistent throughout.
Include Nigerian street slang naturally: "e don cast", "dem no fit stop us", "area", "show dem".
Hook should be short and powerful — 2 lines maximum, very memorable.
Verse should tell a story of where you came from and where you're going.`,
  },

  // ── FAST ENGLISH RAP ──────────────────────────────────────────
  eminem_rap: {
    sunoTags: 'fast technical rap, complex multisyllabic rhyme schemes, rapid fire English delivery, emotional storytelling, cinematic dramatic beat, intense narrative, powerful vulnerable vocals, introspective',
    negativeTags: 'Afrobeats, Nigerian, slow, mellow, generic pop',
    vibe: 'fast technical emotional English rap — storytelling with complex rhymes',
    lyricStyle: `Write in English. Fast delivery implied.
Complex multisyllabic rhyme schemes — every line should have internal rhymes too.
This is storytelling rap. Every verse tells a chapter of the person's story.
Emotional arc: struggle → determination → breakthrough.
Do not use simple rhymes. "time/rhyme" is boring. Use: "situation/dedication/imagination" level complexity.
Hook is melodic, not rapped — a moment of vulnerability in the song.
Make the listener feel the person's journey deeply.`,
  },

  // ── SLOW SOUL / LIFE SONG ─────────────────────────────────────
  slow_soul: {
    sunoTags: 'Nigerian soul, slow emotional ballad, piano-led, soft drums, warm bass, intimate vocals, introspective, life reflection, 65 BPM, soulful, emotional depth, Warren style sound',
    negativeTags: 'fast, aggressive, party, rap, electronic',
    vibe: 'slow soul-touching life song — personal and deeply emotional',
    lyricStyle: `Write in English with natural Pidgin phrases.
This is a personal life reflection song. Intimate and vulnerable.
About real human experiences: loneliness, hope, growth, loving yourself, perseverance.
Long flowing lines that feel like diary entries set to music.
Chorus is a simple emotional truth: "I'm still standing", "This too shall pass", "I choose to rise".
Reference specific real human moments: crying alone, almost giving up, finding strength.
Make the person listening feel truly understood.`,
  },

  // ── HAUSA / PIDGIN ────────────────────────────────────────────
  hausa_pidgin: {
    sunoTags: 'Northern Nigerian sound, Hausa cultural music, talking drum, traditional percussion, melodic male vocalist, Hausa and Pidgin blend, warm celebratory, 90 BPM, cultural authenticity',
    negativeTags: 'Western pop, EDM, harsh, aggressive, generic',
    vibe: 'Hausa cultural music blended naturally with Pidgin',
    lyricStyle: `Write in Hausa naturally mixed with Nigerian Pidgin.
Use real Hausa expressions and cultural warmth:
- Greetings and blessings: "Sannu", "Nagode" (thank you), "Allah ya kyauta" (God bless)
- Praise: "Ka yi kyau" (you did well), "Gaskiya" (truth)
The blend should feel like someone from Kano or Kaduna who also speaks Pidgin.
Chorus should be a Hausa phrase that is short and meaningful.
Reference northern Nigerian culture: family values, God's blessing, community.`,
  },
};

// Premium languages requiring deeper cultural knowledge
const PREMIUM_LANGUAGES = [
  'Igbo',
  'Yoruba',
  'Hausa',
  'Nigerian Pidgin mixed with Yoruba naturally',
  'Nigerian Pidgin mixed with Igbo naturally',
  'Hausa mixed with Pidgin',
];

function isPremiumLanguage(language) {
  if (!language) return false;
  return PREMIUM_LANGUAGES.some(l => language.toLowerCase().includes(l.toLowerCase().split(' ')[0].toLowerCase()));
}

// The single creative decision point — returns everything MusicService needs
async function buildMusicPrompt(session) {
  const genre = session.music_genre || 'afrobeats';
  const occasion = session.music_occasion || 'celebration';
  const personName = session.music_person_name || 'the celebrant';
  const userStory = session.music_story || session.voice_transcript || '';
  const language = session.music_language || 'Nigerian Pidgin English';
  const customLyrics = session.music_custom_lyrics || null;
  const dna = MUSIC_DNA[genre] || MUSIC_DNA.afrobeats;

  // If user wrote their own lyrics — skip GPT for lyrics, just build Suno params
  if (customLyrics) {
    return {
      lyrics: customLyrics,
      title: `${personName} — ${occasion}`,
      tags: dna.sunoTags,
      negativeTags: dna.negativeTags,
      coverPrompt: `${genre} music cover art for a song called "${personName}", Nigerian aesthetic, vibrant, cultural`,
      previewLine: customLyrics.split('\n').find(l => l.trim().length > 10) || customLyrics.slice(0, 80),
      mode: 'custom',
    };
  }

  // Build the creative brief for GPT
  const systemPrompt = `You are a professional Nigerian music lyricist. Your job is to write authentic, deeply personal Nigerian songs that sound like they were written by a real Nigerian artist — not an AI.

GOLDEN RULES:
1. Every single line must connect to the specific person and story given. Zero generic filler lines.
2. The chorus must be something people will remember after one listen.
3. Language must be culturally authentic — not translated English wearing Pidgin clothes.
4. Do NOT reference any specific artist names anywhere.
5. Emotional payoff is mandatory — the song must make the recipient feel something real.
6. Structure tags are mandatory: [Verse], [Chorus], [Bridge] or [Outro]
7. Total lyrics: 60-90 seconds when sung (150-220 words max)

LYRIC WRITING STYLE FOR THIS GENRE:
${dna.lyricStyle}

Return ONLY valid JSON. No markdown. No explanation. Raw JSON:
{
  "lyrics": "structured lyrics with tags",
  "title": "creative song title",
  "previewLine": "most memorable line from chorus"
}`;

  const userPrompt = `Write a ${dna.vibe} song.

RECIPIENT: ${personName}
OCCASION: ${occasion}
THEIR STORY (use every detail): ${userStory || 'A special celebratory song'}
LANGUAGE: ${language}

The song must:
- Use the recipient's name naturally at least twice
- Reference at least one specific detail from their story
- Have a chorus people will sing along to after one listen
- Feel like it was made specifically for this person, not a template`;

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 1200,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.85, // slightly creative but controlled
  });

  const raw = response.choices[0].message.content;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error('promptBuilder parse error:', raw);
    throw new Error('Failed to parse lyrics from GPT');
  }

  return {
    lyrics: parsed.lyrics,
    title: parsed.title || `${personName} — ${occasion}`,
    tags: dna.sunoTags,
    negativeTags: dna.negativeTags,
    coverPrompt: `Nigerian music cover art, ${genre} style, for a song called "${parsed.title || personName}", vibrant cultural aesthetic, professional album art`,
    previewLine: parsed.previewLine || '',
    mode: 'custom',
  };
}

module.exports = { buildMusicPrompt, MUSIC_DNA, isPremiumLanguage };
