const OpenAI = require('openai');
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ══════════════════════════════════════════════════════════════════
// MUSIC DNA — Suno V5.5 verified rules applied:
// - Style field kept under 200 chars, STRICT ORDER: Genre→Mood→Instruments→Vocals→Production
// - Vocal gender is MANDATORY (Suno randomizes if unspecified)
// - negativeTags placed at end, 2-3 max, most reliable Tier-1 controls
// ══════════════════════════════════════════════════════════════════

const MUSIC_DNA = {
  afrobeats: {
    tagsTemplate: (gender) => `Afrobeats, upbeat and celebratory, log drum, shekere, talking drum, ${gender} Nigerian vocals, catchy hook, radio-ready, no autotune, no rock`,
    vibe: 'hype celebratory Afrobeats',
    lyricStyle: 'Nigerian Pidgin mixed with English. Real Pidgin expressions only.',
  },
  amapiano: {
    tagsTemplate: (gender) => `Amapiano, smooth and groovy, log drum piano, deep bass, ${gender} Nigerian vocals, melodic, hypnotic, no rock, no fast rap`,
    vibe: 'smooth groovy Amapiano',
    lyricStyle: 'Smooth Nigerian Pidgin or English. Flowing, hypnotic, repetitive in a good way.',
  },
  street_pop: {
    tagsTemplate: (gender) => `Nigerian street pop, raw youthful energy, trap hi-hats, talking drum, ${gender} autotune vocals, Lagos nightlife, no classical, no slow`,
    vibe: 'raw youthful Nigerian street pop',
    lyricStyle: 'Raw street Pidgin. Very short sharp lines. TikTok-ready hook.',
  },
  pidgin_mix: {
    tagsTemplate: (gender) => `Afrobeats fusion, warm and emotional, deep bass, Pidgin and Yoruba blend, ${gender} vocals, no Western pop, no EDM`,
    vibe: 'Pidgin and Yoruba blended Afrobeats',
    lyricStyle: 'Verses in Pidgin. Chorus or ad-libs in natural short Yoruba phrases.',
  },
  igbo_highlife: {
    tagsTemplate: (gender) => `Igbo highlife, festive and traditional, ogene percussion, acoustic guitar, ${gender} Igbo vocals, call and response, no Western pop, no trap`,
    vibe: 'authentic Igbo highlife with ogene',
    lyricStyle: 'Authentic Igbo. Real proverbs and praise names. Short call-and-response lines.',
  },
  pidgin_igbo: {
    tagsTemplate: (gender) => `Afrobeats fusion, heartfelt, ogene percussion under modern beat, Pidgin and Igbo blend, ${gender} vocals, no generic pop, no harsh`,
    vibe: 'Pidgin verses with Igbo chorus',
    lyricStyle: 'Pidgin verses. Igbo chorus with one real proverb or praise phrase.',
  },
  yoruba_juju: {
    tagsTemplate: (gender) => `Yoruba juju, traditional and celebratory, talking drum, guitar, ${gender} Yoruba vocals, oriki praise style, no rap, no EDM`,
    vibe: 'traditional Yoruba juju praise oriki',
    lyricStyle: 'Proper Yoruba oriki. Praise the person, their qualities, call blessings. Repeat their name.',
  },
  hausa_pidgin: {
    tagsTemplate: (gender) => `Northern Nigerian sound, warm and cultural, talking drum, traditional percussion, ${gender} vocals, no Western pop, no EDM`,
    vibe: 'Hausa cultural music blended with Pidgin',
    lyricStyle: 'Hausa mixed naturally with Pidgin. Real Hausa blessings and greetings.',
  },
  gospel: {
    tagsTemplate: (gender) => `Nigerian gospel, emotional and uplifting, choir vocals, piano, worship drums, ${gender} lead vocals, no rap, no aggressive`,
    vibe: 'powerful Nigerian gospel worship',
    lyricStyle: 'Pidgin and English. Real testimony. One specific story of breakthrough.',
  },
  deep_worship: {
    tagsTemplate: (gender) => `Nigerian deep worship, intimate and reverent, slow piano, ambient strings, breathy ${gender} vocals, no fast, no upbeat, no rap`,
    vibe: 'slow intimate Nigerian deep worship',
    lyricStyle: 'English with worship phrases. Long flowing lines. Simple repeated declaration as chorus.',
  },
  gospel_chant: {
    tagsTemplate: (gender) => `Nigerian gospel chant, spiritual and repetitive, congregation call response, organic drumming, ${gender} lead vocals, no pop, no EDM`,
    vibe: 'Nigerian gospel chant congregation feel',
    lyricStyle: 'Short repeated call-response lines. Mix English, Pidgin, Yoruba/Igbo chant phrases.',
  },
  gospel_praise: {
    tagsTemplate: (gender) => `Nigerian praise, joyful and energetic, choir, praise drums, trumpet, ${gender} lead vocals, no slow, no sad, no rap`,
    vibe: 'energetic Nigerian praise celebration',
    lyricStyle: 'Joyful Pidgin and English. Shout of praise as chorus. Specific testimony in verses.',
  },
  christian_rap: {
    tagsTemplate: (gender) => `Christian hip hop, inspirational, trap beat with choir, Pidgin bars, ${gender} rap vocals, no secular, no explicit`,
    vibe: 'Nigerian Christian rap testimony bars',
    lyricStyle: 'Hard Pidgin bars about real struggle and faith. Melodic singable hook.',
  },
  naija_rap: {
    tagsTemplate: (gender) => `Nigerian street rap, aggressive and hard hitting, 808 bass, trap hi-hats, fast ${gender} rap vocals, no soft, no slow, no gospel`,
    vibe: 'hard Nigerian street rap',
    lyricStyle: 'Raw aggressive Pidgin. Tight rhyme scheme. Short powerful hook, max 2 lines.',
  },
  eminem_rap: {
    tagsTemplate: (gender) => `fast technical rap, intense and emotional, cinematic beat, complex flow, ${gender} rap vocals, no Afrobeats, no slow`,
    vibe: 'fast technical emotional English rap',
    lyricStyle: 'English. Complex rhymes. Melodic hook (not rapped) for emotional release.',
  },
  slow_soul: {
    tagsTemplate: (gender) => `Nigerian soul, slow and emotional, piano-led, soft drums, intimate ${gender} vocals, no fast, no aggressive, no party`,
    vibe: 'slow soul-touching life song',
    lyricStyle: 'English with Pidgin phrases. Diary-entry feel. Simple emotional truth as chorus.',
  },
};

const PREMIUM_LANGUAGES = [
  'Igbo', 'Yoruba', 'Hausa',
  'Nigerian Pidgin mixed with Yoruba naturally',
  'Nigerian Pidgin mixed with Igbo naturally',
  'Hausa mixed with Pidgin',
];

function isPremiumLanguage(language) {
  if (!language) return false;
  return PREMIUM_LANGUAGES.some(l => language.toLowerCase().includes(l.toLowerCase().split(' ')[0].toLowerCase()));
}

async function buildMusicPrompt(session) {
  const genre = session.music_genre || 'afrobeats';
  const occasion = session.music_occasion || 'celebration';
  const personName = session.music_person_name || 'the celebrant';
  const userStory = session.music_story || session.voice_transcript || '';
  const language = session.music_language || 'Nigerian Pidgin English';
  const customLyrics = session.music_custom_lyrics || null;
  const vocalGender = session.music_vocal_gender || 'male'; // mandatory — fixes Suno randomization
  const dna = MUSIC_DNA[genre] || MUSIC_DNA.afrobeats;

  const genderWord = vocalGender === 'female' ? 'female' : 'male';
  const tags = dna.tagsTemplate(genderWord);

  if (customLyrics) {
    return {
      lyrics: customLyrics,
      title: `${personName} — ${occasion}`,
      tags,
      coverPrompt: `${genre} album cover, Nigerian aesthetic, vibrant`,
      previewLine: customLyrics.split('\n').find(l => l.trim().length > 10) || customLyrics.slice(0, 80),
    };
  }

  // ══════════════════════════════════════════════════════
  // Verified Suno V5.5 lyric-writing rules baked into the
  // system prompt — this is what was missing before:
  // - 6-12 syllables per line (rap: up to 16)
  // - Chorus: 2-4 lines MAX, strongest line first
  // - Verse: up to 8 lines MAX, strongest line first
  // - Explicit AABB or ABAB rhyme scheme
  // - Total 150-220 words
  // ══════════════════════════════════════════════════════

  const isRap = ['naija_rap', 'eminem_rap', 'christian_rap'].includes(genre);

  const systemPrompt = `You are a professional Nigerian songwriter who writes lyrics specifically engineered for Suno AI's vocal engine. AI singing needs DISCIPLINED structure — not poetry, not rambling.

NON-NEGOTIABLE STRUCTURAL RULES (verified Suno V5.5 behavior):
1. Line length: ${isRap ? '10-16 syllables per line (rap delivery is faster)' : '6-12 syllables per line MAXIMUM'}. Count before writing.
2. CHORUS RULE: maximum 2-4 lines. Put your strongest, most memorable line FIRST. This line carries the most melodic weight.
3. VERSE RULE: maximum 8 lines per verse. Put your strongest line first in each verse too.
4. RHYME SCHEME: use a consistent AABB or ABAB pattern throughout — this gives Suno's vocal engine a rhythmic anchor. Do not break the pattern.
5. Total lyrics: 150-220 words MAXIMUM across the whole song.
6. Structure tags only: [Verse], [Chorus], [Bridge], [Outro]. Nothing else in brackets.
7. Keep pacing CONSISTENT within each section — don't mix a 4-syllable line with a 14-syllable line in the same verse.
8. Use simple, common, clearly-pronounceable words. Avoid unusual vocabulary — it renders garbled.
9. Read every line in your head before finalizing — if it sounds awkward spoken, it sounds worse sung.
10. NEVER reference any real artist names anywhere.

GENRE-SPECIFIC STYLE:
${dna.lyricStyle}

CREATIVE RULES:
- Every line must connect to the specific person and story given — zero generic filler
- Use the recipient's name naturally at least twice
- Reference at least one concrete detail from their story
- The chorus must be something a stranger could sing along to after hearing it once

Return ONLY valid JSON. No markdown. No explanation. Raw JSON:
{
  "lyrics": "structured lyrics following ALL rules above, with consistent rhyme scheme",
  "title": "short creative song title",
  "previewLine": "the strongest chorus line"
}`;

  const userPrompt = `Write a ${dna.vibe} song.

RECIPIENT: ${personName}
OCCASION: ${occasion}
THEIR STORY: ${userStory || 'A special celebratory song'}
LANGUAGE: ${language}

Remember: ${isRap ? '10-16' : '6-12'} syllables per line, consistent AABB or ABAB rhyme, chorus max 4 lines with strongest line first, verse max 8 lines, 150-220 words total.`;

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 900,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.8,
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
    tags,
    coverPrompt: `Nigerian ${genre} album cover art, vibrant cultural aesthetic for "${parsed.title}"`,
    previewLine: parsed.previewLine || '',
  };
}

module.exports = { buildMusicPrompt, MUSIC_DNA, isPremiumLanguage };
