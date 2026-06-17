const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { toFile } = require('openai');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const OUTPUT_DIR = path.join(__dirname, '../../public/generated');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

/**
 * Generates a meme/flyer image.
 * - If photoLocalPath is provided, uses the /images/edits endpoint with the
 *   uploaded photo as a real reference image (gpt-image-2 supports high-fidelity
 *   image input -- the real face/logo can influence the output directly).
 * - If no photo, uses the standard /images/generations endpoint.
 */
async function generateMemeImage({ imagePrompt, recipientName, category, photoLocalPath }) {
  const watermarkText = process.env.WATERMARK_TEXT || 'NaijaMeme';
  const fullPrompt = `${imagePrompt}. Add a small subtle "${watermarkText}" watermark text in the bottom right corner. Professional Nigerian graphic design quality, bold readable text, 1080x1080 square format.`;

  let response;
  try {
    if (photoLocalPath && fs.existsSync(photoLocalPath)) {
      // EDIT PATH -- real uploaded photo used as reference image
      const editPrompt = `${fullPrompt}\n\nUse the attached reference photo as the real person/logo featured in the design -- keep their actual likeness recognizable, then build the full graphic design (text, banners, layout, background scene) around it exactly as described above.`;

      response = await client.images.edit({
        model: 'gpt-image-2',
        image: await toFile(fs.createReadStream(photoLocalPath), null, {
          type: 'image/jpeg',
        }),
        prompt: editPrompt,
        size: '1024x1024',
        quality: 'high',
      });
    } else {
      // GENERATE PATH -- no reference photo, pure text-to-image
      response = await client.images.generate({
        model: 'gpt-image-2',
        prompt: fullPrompt,
        n: 1,
        size: '1024x1024',
        quality: 'high',
      });
    }
  } catch (err) {
    console.error('OpenAI image generation FULL error:', JSON.stringify(err.error || err.response?.data || err.message));
    throw err;
  }

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
