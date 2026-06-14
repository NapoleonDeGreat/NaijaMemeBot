const OpenAI = require('openai');
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const CATEGORY_PROMPTS = {
  thank_you: {
    tone: 'warm, grateful, celebratory, Naija hype energy',
    instruction: 'Write a warm heartfelt Nigerian Pidgin thank-you message. Big energy. Like someone who just received a credit alert.',
  },
  apology: {
    tone: 'sincere, humble, begging but still with Naija flair',
    instruction: 'Write a sincere apology in Nigerian Pidgin. Humble but not desperate. Mention God. Keep it real.',
  },
  ask_money: {
    tone: 'witty, charming, emotionally intelligent begging',
    instruction: 'Write a funny but touching money request in Nigerian Pidgin. Charming and hard to say no to.',
  },
  customer_appreciation: {
    tone: 'business-warm, appreciative, Nigerian hospitality energy',
    instruction: 'Write a Nigerian business-style customer appreciation message. Warm but still Naija. Make them feel like royalty.',
  },
};

async function generateCaption({ category, recipientName, notes, voiceTranscript }) {
  const config = CATEGORY_PROMPTS[category] || CATEGORY_PROMPTS.thank_you;

  const contextLines = [
    `Recipient name: ${recipientName}`,
    notes ? `User notes: ${notes}` : null,
    voiceTranscript ? `Voice note transcript: "${voiceTranscript}"` : null,
  ].filter(Boolean).join('\n');

  const systemPrompt = `You are a Nigerian Pidgin creative writer. You write short punchy emotional captions for WhatsApp meme images.

Rules:
- Write in Nigerian Pidgin English mixed with occasional English
- Keep it under 3 sentences max
- ALWAYS include the recipient's name naturally
- Tone: ${config.tone}
- No hashtags, no emojis in output
- Do not add quotation marks around the output`;

  const userPrompt = `${config.instruction}

Context:
${contextLines}

Write ONLY the caption. Nothing else.`;

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 150,
    temperature: 0.85,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });

  return response.choices[0].message.content.trim();
}

module.exports = { generateCaption };
