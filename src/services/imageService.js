const OpenAI = require('openai');
const axios = require('axios');
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

  // Generate with DALL-E 3
  const response = await client.images.generate({
    model: 'dall-e-3',
    prompt: fullPrompt,
    n: 1,
    size: '1024x1024',
    quality: 'hd',
    style: 'vivid',
  });

  const imageUrl = response.data[0].url;

  // Download and save the image
  const imageResponse = await axios.get(imageUrl, {
    responseType: 'arraybuffer',
  });

  const filename = `${uuidv4()}.jpg`;
  const outputPath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(outputPath, Buffer.from(imageResponse.data));

  return {
    localPath: outputPath,
    filename,
    publicUrl: `${process.env.APP_URL}/generated/${filename}`,
    dalleUrl: imageUrl, // Direct DALL-E URL (valid for 1 hour)
  };
}

module.exports = { generateMemeImage };
