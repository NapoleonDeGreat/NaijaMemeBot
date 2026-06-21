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
/**
 * Generates a meme/flyer image.
 * - If photoLocalPaths (array) has 1+ entries, uses the /images/edits
 *   endpoint with all uploaded photos as reference images (gpt-image-2
 *   supports up to 16 reference images per edit call, blended together).
 * - If no photos, uses the standard /images/generations endpoint.
 * - photoTypes (parallel array) tags each photo as 'person', 'logo', or
 *   'product' -- this matters because a person needs face-lock
 *   preservation (keep the face, redesign everything around it), while
 *   a product/logo photo needs the OPPOSITE treatment: preserve the
 *   entire photo as a real composited element, since there's no face to
 *   anchor onto and discarding the real product shot to "design a new
 *   scene" produces a generic stock-photo result instead of the
 *   customer's actual rice, beans, or shop photo.
 */
async function generateMemeImage({ imagePrompt, recipientName, category, photoLocalPaths, photoTypes, outfitPreference }) {
  const watermarkText = process.env.WATERMARK_TEXT || 'NaijaMeme';
  const fullPrompt = `${imagePrompt}. Add a small subtle "${watermarkText}" watermark text in the bottom right corner. Square 1080x1080 format.`;

  const validPhotoPaths = (photoLocalPaths || []).filter(p => p && fs.existsSync(p));
  // Default every photo to 'person' if no types array was provided, to
  // stay backward compatible with any call site that hasn't been
  // updated to pass photoTypes yet.
  const types = (photoTypes && photoTypes.length === validPhotoPaths.length)
    ? photoTypes
    : validPhotoPaths.map(() => 'person');

  const personIndexes = types.map((t, i) => (t === 'person' ? i : -1)).filter(i => i >= 0);
  const nonPersonIndexes = types.map((t, i) => (t !== 'person' ? i : -1)).filter(i => i >= 0);

  // Outfit preference applies only to person photos -- a business owner
  // or birthday celebrant may want their real outfit kept rather than
  // replaced.
  const keepOutfit = outfitPreference && /keep/i.test(outfitPreference);
  const clothingInstruction = keepOutfit
    ? `- Clothing: PRESERVE exactly as worn in the reference photo -- same garment, colour, pattern, and fit. Do NOT change or upgrade the outfit.`
    : `- Clothing: upgrade to suit the flyer style (formal attire, traditional wear, campaign suit, wedding outfit -- whatever the design calls for)`;

  let response;
  try {
    if (validPhotoPaths.length > 0) {
      // EDIT PATH -- one or more real uploaded photos used as references
      const referenceDescriptions = types.map((t, i) => {
        const num = i + 1;
        if (t === 'person') return `Reference Image ${num} is a real person to feature in the design`;
        if (t === 'logo') return `Reference Image ${num} is the business's real logo -- feature it exactly as-is, do not redesign or reinterpret it`;
        return `Reference Image ${num} is a real product/shop photo to feature in the design exactly as it was taken`;
      }).join('. ');

      const preserveBlock = [];
      const changeBlock = [];

      if (personIndexes.length > 0) {
        preserveBlock.push(`- Every person's face exactly as uploaded (Reference Image${personIndexes.length > 1 ? 's' : ''} ${personIndexes.map(i => i + 1).join(', ')}) -- same eyes, nose, mouth, jawline, face shape, skin tone, skin texture, and facial hair`);
        preserveBlock.push(`- Facial landmarks and bone structure must remain pixel-identical to the reference`);
        preserveBlock.push(`- Do NOT idealize, smooth, slim, or "improve" any face -- use the exact real face from the reference image`);
        changeBlock.push(clothingInstruction);
        changeBlock.push(`- Background behind the person(s): replace with the designed scene described above`);
        changeBlock.push(`- Lighting on the person(s): apply cinematic studio-quality lighting (directional key light, soft fill, rim separation) while preserving facial features`);
      }

      if (nonPersonIndexes.length > 0) {
        preserveBlock.push(`- Every product/logo photo (Reference Image${nonPersonIndexes.length > 1 ? 's' : ''} ${nonPersonIndexes.map(i => i + 1).join(', ')}) -- use the REAL photo exactly as uploaded, do NOT regenerate, reinterpret, or replace it with a generic substitute. This is the customer's actual product/shop/logo and must be recognizably the same photo, just composited cleanly into the design`);
        preserveBlock.push(`- Do NOT invent a different-looking version of the product -- if the reference shows specific items (e.g. a particular bag of rice, a specific dress), the output must show those exact same real items, not a reimagined version`);
        changeBlock.push(`- Around the product/logo photo(s): add the designed background, typography, data bands, and other graphic elements described above, treating the real photo as a composited element within the layout (like a professional designer would composite a real product shot into a flyer) rather than a scene to repaint`);
      }

      changeBlock.push(`- Add all graphic design elements (text, banners, logos, data bars) as described in the design brief above`);

      const editPrompt = `${fullPrompt}

REFERENCE IMAGES: ${referenceDescriptions}.

PRESERVE (do not alter under any circumstances):
${preserveBlock.join('\n')}

CHANGE (apply the full design around what's preserved):
${changeBlock.join('\n')}

The final result must look like a professional Nigerian graphic designer took the real uploaded photo(s) and composited them into a premium designed flyer -- NOT like AI generated new content loosely inspired by the photos. Every real face, product, and logo must be recognizably the exact same one that was uploaded.`;

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
