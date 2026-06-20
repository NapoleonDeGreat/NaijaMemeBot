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
 * - If photoLocalPaths (array) has 1+ entries, uses the /images/edits
 *   endpoint with all uploaded photos as reference images (gpt-image-2
 *   supports up to 16 reference images per edit call, blended together).
 * - If no photos, uses the standard /images/generations endpoint.
 */
async function generateMemeImage({ imagePrompt, recipientName, category, photoLocalPaths }) {
  const watermarkText = process.env.WATERMARK_TEXT || 'NaijaMeme';
  const fullPrompt = `${imagePrompt}. Add a small subtle "${watermarkText}" watermark text in the bottom right corner. Square 1080x1080 format.`;

  const validPhotoPaths = (photoLocalPaths || []).filter(p => p && fs.existsSync(p));

  let response;
  try {
    if (validPhotoPaths.length > 0) {
      // EDIT PATH -- one or more real uploaded photos used as references
      const referenceLabels = validPhotoPaths
        .map((_, i) => `Image ${i + 1} is a real reference photo to feature in the design`)
        .join('. ');

      const referenceDescriptions = validPhotoPaths.map((_, i) => {
        if (validPhotoPaths.length === 1) return 'Reference Image 1 is the real person/logo to feature';
        return `Reference Image ${i + 1} is a real person to feature in the design`;
      }).join('. ');

      // FACE-LOCK pattern: explicitly split what changes vs what is preserved.
      // Without this, gpt-image-2 defaults to "improving" the face into a
      // generic idealized version that no longer matches the uploaded person.
      const editPrompt = `${fullPrompt}

REFERENCE IMAGES: ${referenceDescriptions}.

PRESERVE (do not alter under any circumstances):
- Every person's face exactly as uploaded -- same eyes, nose, mouth, jawline, face shape, skin tone, skin texture, and facial hair
- Facial landmarks and bone structure must remain pixel-identical to the reference
- Do NOT idealize, smooth, slim, or "improve" any face -- use the exact real face from the reference image

CHANGE (apply the full design around the preserved faces):
- Clothing: upgrade to suit the flyer style (formal attire, traditional wear, campaign suit, wedding outfit -- whatever the design calls for)
- Background: replace entirely with the designed scene described above
- Lighting: apply cinematic studio-quality lighting (directional key light, soft fill, rim separation) while preserving facial features
- Add all graphic design elements (text, banners, logos, data bars) as described in the design brief above

The final result must look like a professional Nigerian graphic designer took the real uploaded photo, professionally retouched it to 8K studio quality, dressed the person appropriately, and composited them into a premium designed flyer -- NOT like AI generated a new face inspired by the photo.`;

      const imageFiles = await Promise.all(
        validPhotoPaths.map(p => toFile(fs.createReadStream(p), null, { type: 'image/jpeg' }))
      );

      response = await client.images.edit({
        model: 'gpt-image-2',
        image: imageFiles,
        prompt: editPrompt,
        size: '1024x1024',
        quality: 'high',
      });
    } else {
      // GENERATE PATH -- no reference photos, pure text-to-image
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

  // Strip any trailing slash from APP_URL before concatenating, so a
  // value like "https://example.com/" doesn't produce a double slash
  // ("https://example.com//generated/...") which breaks WhatsApp's
  // ability to fetch the image (this was a real bug found in production).
  const baseUrl = (process.env.APP_URL || '').replace(/\/+$/, '');

  return {
    localPath: outputPath,
    filename,
    publicUrl: `${baseUrl}/generated/${filename}`,
  };
}

module.exports = { generateMemeImage };
