const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const OUTPUT_DIR = path.join(__dirname, '../../public/generated');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function generateMemeImage({ imagePrompt, recipientName, category }) {
  // Add watermark instruction to prompt
  const watermarkText = process.env.WATERMARK_TEXT || 'NaijaMeme';
  const fullPrompt = `${imagePrompt}. Add a small subtle "${watermarkText}" watermark text in the bottom right corner. Professional Nigerian graphic design quality. 1080x1080 square format.`;

  // Generate with GPT Image 1.5 (DALL-E 3 was shut down by OpenAI on May 12, 2026)
  let response;
  try {
    response = await client.images.generate({
      model: 'gpt-image-1.5',
      prompt: fullPrompt,
      n: 1,
      size: '1024x1024',
      quality: 'high',
    });
  } catch (err) {
    // TEMP DEBUG — surface the real OpenAI error detail
    console.error('OpenAI image generation FULL error:', JSON.stringify(err.error || err.response?.data || err.message));
    throw err;
  }

  // GPT Image models return base64 data by default (no "url" field like DALL-E had)
  const base64Data = response.data[0].b64_json;

  if (!base64Data) {
    throw new Error('No image data returned from OpenAI');
  }

  const filename = `${uuidv4()}.jpg`;
  const outputPath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(outputPath, Buffer.from(base64Data, 'base64'));

  return {
    localPath: outputPath,
    filename,
    publicUrl: `${process.env.APP_URL}/generated/${filename}`,
  };
}

module.exports = { generateMemeImage };

