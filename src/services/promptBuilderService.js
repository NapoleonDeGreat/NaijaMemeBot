const OpenAI = require('openai');
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const GENRE_CONFIGS = {
  afrobeats: {
    sunoTags: 'Afrobeats, modern Nigerian pop, catchy hook, danceable, log drum, shekere, male Nigerian accent, Lagos energy, radio-ready',
    vibe: 'hype and celebratory Afrobeats',
  },
  amapiano: {
    sunoTags: 'Amapiano, log drum piano stabs, South African house influence, groovy, 115 BPM, deep bass, Nigerian vocalist, smooth',
    vibe: 'smooth and groovy Amapiano',
  },
  igbo_highlife: {
    sunoTags: 'Igbo highlife, ogene metallic percussion, traditional Anambra sound, call and response vocals, celebratory, acoustic guitar, Igbo male singer, Onitsha style',
    vibe: 'celebratory Igbo traditional highlife with ogene',
  },
  pidgin_igbo: {
    sunoTags: 'Afrobeats fusion, Pidgin English verses mixed with Igbo chorus naturally, ogene percussion underneath modern beat, Lagos meets Enugu sound, Phyno style, catchy hook',
    vibe: 'Pidgin and Igbo fusion Afrobeats',
  },
  yoruba_juju: {
    sunoTags: 'Yoruba juju music, talking drum dundun, guitar, Yoruba praise singing oriki, traditional Nigerian sound, King Sunny Ade style, Yoruba male vocalist',
    vibe: 'traditional Yoruba juju praise singing',
  },
  gospel: {
    sunoTags: 'Nigerian gospel and gospel rap, choir backing vocals, uplifting piano, powerful drums, thanksgiving, Afro-gospel, passionate Nigerian vocalist, worship, spoken word testimony bars, SOG style, Limoblaze influence',
    vibe: 'powerful Nigerian gospel and gospel rap',
  },
  street_pop: {
    sunoTags: 'Nigerian street pop, Asake style, street energy, talking drum samples, trap hi-hats, melodic vocals, Pidgin English',
    vibe: 'raw Nigerian street pop energy',
  },
  naija_rap: {
    sunoTags: 'Nigerian street rap, Olamide style, fast Pidgin English flow, heavy 808 bass, Afrobeats percussion, Lagos street slang, raw energy, Reminisce style',
    vibe: 'hard Nigerian street rap Pidgin flow',
  },
  eminem_rap: {
    sunoTags: 'fast technical rap, complex rhyme schemes, storytelling, Eminem style, rapid fire delivery, English lyrics, dramatic beat, emotional narrative, cinematic production',
    vibe: 'fast technical English rap storytelling',
  },
  pidgin_mix: {
    sunoTags: 'Afrobeats, Pidgin English lyrics, Yoruba ad-libs scattered, modern Nigerian sound, catchy hook, radio-ready, Burna Boy energy, emotional',
    vibe: 'mixed Naija Pidgin and Yoruba Afrobeats',
  },
};

const PREMIUM_LANGUAGES = [
  'Igbo',
  'Yoruba',
  'Hausa',
  'Nigerian Pidgin mixed with Yoruba naturally',
  'Nigerian Pidgin mixed with Igbo naturally',
];

function isPremiumLanguage(language) {
  return PREMIUM_LANGUAGES.some(l => language?.includes(l.split(' ')[0]));
}

async function buildMusicPrompt(session) {
  const genre = session.music_genre || 'afrobeats';
  const occasion = session.music_occasion || 'celebration';
  const personName = session.music_person_name || '';
  const userStory = session.music_story || session.voice_transcript || '';
  const language = session.music_language || 'Nigerian Pidgin English';
  const customLyrics = session.music_custom_lyrics || null;
  const genreConfig = GENRE_CONFIGS[genre] || GENRE_CONFIGS.afrobeats;

  if (customLyrics) {
    const sunoPrompt = `${genreConfig.sunoTags}. Song about ${occasion} for ${personName}.`;
    return {
      lyrics: customLyrics,
      sunoPrompt,
      title: `${personName} - ${occasion}`,
      previewLine: customLyrics.split('\n').find(l => l.trim().length > 10) || customLyrics.slice(0, 60),
    };
  }

  const systemPrompt = `You are a professional Nigerian music lyricist and Suno AI prompt engineer with deep knowledge of Nigerian cultures.

Your expertise:
- Pidgin English: natural flow, street expressions, correct Nigerian cadence
- Igbo: correct grammar, praise names (Nna m, Nne m, O di mma, Chineke), proverbs, Anambra/Enugu/Imo dialects, ogene call-and-response patterns
- Yoruba: correct tones, oriki praise poetry, cultural expressions, juju music phrasing
- Hausa: natural warm phrasing and cultural expressions
- Nigerian Rap: Olamide-style Pidgin bars, fast flow, street energy, Lagos slang
- Gospel Rap: SOG/Limoblaze style, testimony-driven, Pidgin bars over gospel beats
- Eminem-style: fast technical English, complex multisyllabic rhymes, emotional storytelling
- How real Nigerian artists mix languages naturally

Suno AI technical knowledge:
- Use [Verse], [Chorus], [Bridge], [Outro] structure tags
- For rap: use [Verse - Rap] and [Hook] tags
- Keep total lyrics to 60-90 seconds when sung (roughly 150-200 words)
- For rap: write bars with clear rhythm and rhyme scheme
- For gospel rap: alternate between rap bars and melodic chorus

Return ONLY valid JSON. No markdown. No explanation. No code fences. Raw JSON only:
{
  "lyrics": "full song lyrics with section tags",
  "sunoPrompt": "complete Suno style prompt with genre tags, vocal direction, instruments, energy, BPM",
  "title": "song title",
  "previewLine": "the catchiest line from the chorus or hook"
}`;

  const userPrompt = `Create a ${genreConfig.vibe} song with these exact details:

OCCASION: ${occasion}
WHO IT IS FOR: ${personName}
STORY/MESSAGE FROM USER: ${userStory}
LANGUAGE: ${language}
GENRE STYLE TAGS FOR SUNO: ${genreConfig.sunoTags}

REQUIREMENTS:
- Make it deeply personal using the specific details above
- Language must be authentic ${language}
- For Igbo/Pidgin-Igbo: include at least one Igbo proverb or praise name
- For Yoruba: include oriki-style praise lines
- For Pidgin: use real street expressions
- For Naija Rap: fast Pidgin flow, heavy bars, street energy, Lagos slang
- For Gospel Rap: testimony-driven bars, hope and faith theme
- For Eminem style: complex rhyme schemes, fast delivery, emotional storytelling in English
- Chorus/Hook must be catchy and memorable
- The song should make the person it is for feel special`;

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 1500,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
  });

  const raw = response.choices[0].message.content;

  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error('promptBuilder JSON parse error. Raw output:', raw);
    throw new Error('Failed to parse music prompt from GPT');
  }
}

module.exports = { buildMusicPrompt, GENRE_CONFIGS, isPremiumLanguage };
