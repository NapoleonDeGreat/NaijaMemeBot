const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
  yoruba_juju: {
    sunoTags: 'Yoruba juju music, talking drum dundun, guitar, Yoruba praise singing oriki, traditional Nigerian sound, King Sunny Ade style, Yoruba male vocalist',
    vibe: 'traditional Yoruba juju praise singing',
  },
  gospel: {
    sunoTags: 'Nigerian gospel, choir backing vocals, uplifting piano, powerful drums, thanksgiving, Afro-gospel, passionate Nigerian vocalist, worship',
    vibe: 'powerful Nigerian gospel thanksgiving',
  },
  street_pop: {
    sunoTags: 'Nigerian street pop, Asake style, street energy, agbadá boys sound, talking drum samples, trap hi-hats, melodic vocals, Pidgin English',
    vibe: 'raw Nigerian street pop energy',
  },
  pidgin_mix: {
    sunoTags: 'Afrobeats, Pidgin English lyrics, Yoruba ad-libs scattered, modern Nigerian sound, catchy hook, radio-ready, Burna Boy energy, emotional',
    vibe: 'mixed Naija Pidgin and Yoruba Afrobeats',
  },
};

// Which languages are premium tier (₦1,500)
const PREMIUM_LANGUAGES = ['Igbo', 'Yoruba', 'Hausa', 'Nigerian Pidgin mixed with Yoruba naturally', 'Nigerian Pidgin mixed with Igbo naturally'];

function isPremiumLanguage(language) {
  return PREMIUM_LANGUAGES.some(l => language?.includes(l.split(' ')[0]));
}

async function buildMusicPrompt(session) {
  const genre = session.music_genre || 'afrobeats';
  const occasion = session.music_occasion || 'celebration';
  const personName = session.music_person_name || '';
  const userStory = session.music_story || session.voice_transcript || '';
  const language = session.music_language || 'Nigerian Pidgin English';
  const genreConfig = GENRE_CONFIGS[genre] || GENRE_CONFIGS.afrobeats;

  const systemPrompt = `You are a professional Nigerian music lyricist and Suno AI prompt engineer with deep knowledge of Nigerian cultures.

Your expertise:
- Pidgin English: natural flow, street expressions, correct Nigerian cadence, "e don happen", "na so e be", "omo"
- Igbo: correct grammar, praise names (Nna m, Nne m, Ọ dị mma, Chineke), proverbs, Anambra/Enugu/Imo dialects, ogene call-and-response patterns
- Yoruba: correct tones implied through spelling, oriki (praise poetry), "omo", "e ma worry", cultural expressions, juju music phrasing
- Hausa: natural warm phrasing, cultural expressions
- How real Nigerian artists mix languages: Burna Boy (Pidgin/Yoruba/English), Asake (Yoruba/Pidgin), Davido (Pidgin/English)

Suno AI technical knowledge:
- Use [Verse], [Chorus], [Bridge], [Outro] tags
- Keep total lyrics to 60-90 seconds when sung (roughly 150-200 words)
- Suno performs best with clear structure and repetitive chorus hooks
- For Igbo with ogene: write short punchy lines that suit call-and-response
- For Yoruba juju: write in praise-singing oriki style with repetition

CRITICAL: Return ONLY valid JSON. No markdown. No explanation. No code fences. Just the raw JSON object.

{
  "lyrics": "full song lyrics with section tags",
  "sunoPrompt": "complete Suno style prompt",
  "title": "song title",
  "previewLine": "the catchiest line from the chorus"
}`;

  const userMessage = `Create a ${genreConfig.vibe} song with these exact details:

OCCASION: ${occasion}
WHO IT IS FOR: ${personName}
STORY/MESSAGE FROM USER: ${userStory}
LANGUAGE: ${language}
GENRE STYLE TAGS FOR SUNO: ${genreConfig.sunoTags}

REQUIREMENTS:
- Make it deeply personal using the specific details above
- Language must be authentic ${language} — not a translation, it should feel like a real Nigerian artist wrote it
- For Igbo: include at least one Igbo proverb or praise name if appropriate
- For Yoruba: include oriki-style praise lines
- For Pidgin: use real street expressions, not formal English translated to Pidgin
- Chorus must be catchy and memorable — something people will sing along to
- The song should make the person it's for feel special and celebrated
- Suno prompt must include: genre tags, vocal style, Nigerian accent direction, instruments, energy level, BPM range`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const raw = response.content[0].text.trim();
  const clean = raw.replace(/```json|```/g, '').trim();

  try {
    return JSON.parse(clean);
  } catch (err) {
    console.error('promptBuilder JSON parse error. Raw output:', raw);
    throw new Error('Failed to parse music prompt from Claude');
  }
}

module.exports = { buildMusicPrompt, GENRE_CONFIGS, isPremiumLanguage };
