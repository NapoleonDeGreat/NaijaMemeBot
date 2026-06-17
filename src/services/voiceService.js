const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Maps the bot's language button choices to Whisper's actual language codes.
// Pidgin has no dedicated Whisper code -- it is English with Pidgin
// vocabulary, so we pass 'en' and rely on the prompt hint for Pidgin words.
const LANGUAGE_CODE_MAP = {
  english: 'en',
  pidgin: 'en',
  yoruba: 'yo',
  igbo: 'ig',
  hausa: 'ha',
};

async function transcribeVoiceNote(audioBuffer, mimeType, languageChoice) {
  const tmpDir = '/tmp';
  const inputId = uuidv4();
  const ext = mimeType.includes('ogg') ? 'ogg' :
               mimeType.includes('mp4') ? 'mp4' :
               mimeType.includes('mpeg') ? 'mp3' : 'ogg';
  const inputPath = path.join(tmpDir, `${inputId}.${ext}`);

  try {
    fs.writeFileSync(inputPath, audioBuffer);

    const audioStream = fs.createReadStream(inputPath);

    // Passing an explicit language code measurably improves Whisper's
    // accuracy versus relying on auto-detection, especially for
    // lower-resource languages like Yoruba, Igbo, and Hausa where the
    // model has much less training data than English. If the user
    // didn't choose a language (older sessions, or the button step was
    // skipped), we omit the param and let Whisper auto-detect.
    const langCode = languageChoice ? LANGUAGE_CODE_MAP[languageChoice] : undefined;

    const params = {
      file: audioStream,
      model: 'whisper-1',
      prompt: 'Nigerian voice message. The speaker may mix English, Nigerian Pidgin, Yoruba, Igbo, or Hausa. Common Pidgin words: dey, na, abeg, wahala, sabi, wetin, abi, sha, oga, madam.',
    };
    if (langCode) {
      params.language = langCode;
    }

    const transcription = await client.audio.transcriptions.create(params);

    return transcription.text;
  } finally {
    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
  }
}

module.exports = { transcribeVoiceNote, LANGUAGE_CODE_MAP };
