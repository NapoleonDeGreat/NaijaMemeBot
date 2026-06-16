const OpenAI = require('openai');
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const CATEGORY_VISUAL_DNA = {
  thank_you: {
    scene: 'A joyful elderly Nigerian man in traditional Igbo red cap and lion print attire, holding a smartphone showing a credit alert, fist raised in celebration, mouth wide open with joy. Warm golden lighting. Cinematic Nollywood energy. Ultra realistic portrait photography.',
    emotion: 'explosive joy, gratitude, celebration',
    tone: 'warm, hype, celebratory Nigerian Pidgin',
  },
  apology: {
    scene: 'A remorseful Nigerian man in traditional attire, hands clasped in prayer, eyes full of genuine sorrow, soft dramatic lighting, tears forming at the edges of his eyes. Cinematic portrait. Ultra realistic. Emotional Nollywood energy.',
    emotion: 'deep remorse, genuine love, vulnerability',
    tone: 'sincere, humble, emotional Nigerian Pidgin',
  },
  ask_money: {
    scene: 'A Nigerian woman in colorful market clothing, arms outstretched in a pleading gesture, eyes wide and expressive with a hint of humor, warm Lagos afternoon light. Cinematic. Ultra realistic. Market background slightly blurred.',
    emotion: 'charming desperation, humor, hope',
    tone: 'witty, charming, irresistible Nigerian Pidgin begging',
  },
  customer_appreciation: {
    scene: 'A proud Nigerian business owner in smart casual attire, warm genuine smile, hands on heart in appreciation, professional studio lighting with warm tones. Cinematic portrait photography. Ultra realistic.',
    emotion: 'warmth, pride, genuine appreciation',
    tone: 'warm Nigerian business appreciation, make them feel like royalty',
  },
  congratulations: {
    scene: 'A Nigerian family celebrating together, confetti in the air, huge smiles, traditional and modern clothing mixed, champagne glasses raised, living room setting with warm light. Cinematic. Ultra realistic. Pure joy energy.',
    emotion: 'pure celebration, pride, excitement',
    tone: 'hype, celebratory, proud Nigerian Pidgin',
  },
  church: {
    scene: 'A Nigerian pastor or church member in white Sunday attire, hands raised in worship, eyes closed in genuine spiritual ecstasy, golden church lighting rays from above. Cinematic portrait. Ultra realistic. Anointed energy.',
    emotion: 'spiritual joy, gratitude to God, blessing',
    tone: 'spiritual, grateful, Nigerian church energy with Pidgin',
  },
  business_advert: {
    scene: 'A confident Nigerian entrepreneur in sharp modern attire, standing in front of their business, arms crossed with pride, Lagos skyline or market background. Professional cinematic photography. Ultra realistic. Boss energy.',
    emotion: 'confidence, pride, hustle',
    tone: 'bold, professional but Naija, call to action energy',
  },
  political: {
    scene: 'A Nigerian political figure in traditional agbada or babariga, hand raised in greeting, crowd energy behind them, Nigerian flag colors subtly in background. Cinematic portrait photography. Ultra realistic. Rally energy.',
    emotion: 'hope, power, community',
    tone: 'powerful, hopeful, Nigerian political Pidgin energy',
  },
  relationship: {
    scene: 'A lovesick young Nigerian man in smart casual wear, hand on chest, eyes full of longing and hope, soft romantic bokeh lighting, Lagos city lights in background. Cinematic portrait. Ultra realistic. Romantic Nollywood energy.',
    emotion: 'romantic longing, hope, charm',
    tone: 'smooth, romantic, charming Nigerian Pidgin',
  },
  academic: {
    scene: 'A proud Nigerian graduate in academic gown holding their certificate high, huge smile, family members celebrating behind them, outdoor campus setting with golden hour lighting. Cinematic. Ultra realistic. Achievement energy.',
    emotion: 'pride, achievement, joy, family pride',
    tone: 'proud, celebratory, Nigerian academic achievement Pidgin',
  },
};

async function generateCaptionAndImagePrompt({
  category,
  recipientName,
  voiceTranscript,
  notes,
  gender,
}) {
  const dna = CATEGORY_VISUAL_DNA[category] || CATEGORY_VISUAL_DNA.thank_you;

  const context = [
    `Recipient name: ${recipientName}`,
    gender ? `Recipient gender: ${gender}` : null,
    voiceTranscript ? `Voice note from sender: "${voiceTranscript}"` : null,
    notes ? `Additional notes: ${notes}` : null,
  ].filter(Boolean).join('\n');

  const systemPrompt = `You are two things in one:
1. A Nigerian Pidgin creative writer who writes short punchy emotional captions
2. A cinematic AI image director who writes DALL-E 3 prompts

Rules for caption:
- Write in Nigerian Pidgin English
- Maximum 2 sentences
- Always include recipient name naturally
- Emotion: ${dna.emotion}
- Tone: ${dna.tone}
- No hashtags, no quotes around output

Rules for image prompt:
- Base scene: ${dna.scene}
- Make it ultra realistic, cinematic, Nollywood energy
- Include the caption text naturally overlaid on the image in bold stylish Nigerian graphic design style
- Add recipient name somewhere on the image naturally
- NO watermarks in the image prompt
- The image must look like it was made by a professional Nigerian graphic designer
- Output must be a complete self-contained DALL-E 3 prompt

Return ONLY valid JSON in this exact format:
{
  "caption": "your caption here",
  "imagePrompt": "your complete DALL-E 3 prompt here"
}`;

  const userPrompt = `Generate for this context:
${context}

Category: ${category}
Return only the JSON. No explanation.`;

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 800,
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

module.exports = { generateCaptionAndImagePrompt };
