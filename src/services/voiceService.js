const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function transcribeVoiceNote(audioBuffer, mimeType) {
  const tmpDir = '/tmp';
  const inputId = uuidv4();
  const ext = mimeType.includes('ogg') ? 'ogg' : 
               mimeType.includes('mp4') ? 'mp4' : 
               mimeType.includes('mpeg') ? 'mp3' : 'ogg';
  const inputPath = path.join(tmpDir, `${inputId}.${ext}`);

  try {
    fs.writeFileSync(inputPath, audioBuffer);

    // Send directly to Whisper without conversion
    // Whisper accepts ogg/opus natively
    const audioStream = fs.createReadStream(inputPath);
    
    const transcription = await client.audio.transcriptions.create({
      file: audioStream,
      model: 'whisper-1',
      language: 'en',
      prompt: 'Nigerian Pidgin English voice message. The speaker may mix English and Pidgin.',
    });

    return transcription.text;
  } finally {
    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
  }
}

module.exports = { transcribeVoiceNote };
