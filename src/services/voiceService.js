const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { v4: uuidv4 } = require('uuid');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function transcribeVoiceNote(audioBuffer, mimeType) {
  const tmpDir = '/tmp';
  const inputId = uuidv4();
  const ext = mimeType.includes('ogg') ? 'ogg' : 'mp4';
  const inputPath = path.join(tmpDir, `${inputId}.${ext}`);
  const outputPath = path.join(tmpDir, `${inputId}.mp3`);

  try {
    fs.writeFileSync(inputPath, audioBuffer);
    execSync(`ffmpeg -i ${inputPath} -ar 16000 -ac 1 -c:a libmp3lame ${outputPath} -y 2>/dev/null`);

    const audioStream = fs.createReadStream(outputPath);
    const transcription = await client.audio.transcriptions.create({
      file: audioStream,
      model: 'whisper-1',
      language: 'en',
      prompt: 'Nigerian Pidgin English voice message',
    });

    return transcription.text;
  } finally {
    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
  }
}

module.exports = { transcribeVoiceNote };
