const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Suno API via sunor.cc wrapper
// Sign up at sunor.cc → get API key → add SUNOR_API_KEY to Railway env vars
const SUNOR_BASE = 'https://api.sunor.cc/v1';

function getSunorHeaders() {
  return {
    Authorization: `Bearer ${process.env.SUNOR_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

const MAX_POLL_ATTEMPTS = 40; // 40 × 6s = 4 minutes max
const POLL_INTERVAL_MS = 6000;

async function generateSong({ sunoPrompt, lyrics, title }) {
  const payload = {
    model: 'suno',
    task_type: 'music',
    input: {
      prompt: sunoPrompt,
      ...(lyrics && { lyrics }),
      ...(title && { title }),
    },
  };

  const { data: submitData } = await axios.post(
    `${SUNOR_BASE}/tasks`,
    payload,
    { headers: getSunorHeaders() }
  );

  const taskId = submitData?.task_id || submitData?.id;
  if (!taskId) throw new Error('Suno: no task_id returned from API');

  console.log(`Suno task submitted: ${taskId}`);

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await sleep(POLL_INTERVAL_MS);

    const { data: pollData } = await axios.get(
      `${SUNOR_BASE}/tasks/${taskId}`,
      { headers: getSunorHeaders() }
    );

    const status = pollData?.status;
    console.log(`Suno poll attempt ${attempt + 1}: status=${status}`);

    if (status === 'completed' || status === 'success') {
      const songs = pollData?.output?.songs || pollData?.songs || [];
      if (!songs.length) throw new Error('Suno: completed but no songs in response');

      const song = songs[0];
      const audioUrl = song.audio_url || song.url;
      if (!audioUrl) throw new Error('Suno: no audio_url in song output');

      const localPath = await downloadAudio(audioUrl);
      const publicUrl = audioUrlToPublic(localPath);

      return {
        audioUrl,
        localPath,
        publicUrl,
        title: song.title || title || 'Your Song',
        duration: song.duration,
      };
    }

    if (status === 'failed' || status === 'error') {
      throw new Error(`Suno generation failed: ${JSON.stringify(pollData)}`);
    }
  }

  throw new Error('Suno: generation timed out after 4 minutes');
}

async function downloadAudio(url) {
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  const buffer = Buffer.from(response.data);

  const filename = `song_${uuidv4()}.mp3`;
  const uploadDir = path.join(__dirname, '../../public/uploads');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  const localPath = path.join(uploadDir, filename);
  fs.writeFileSync(localPath, buffer);
  return localPath;
}

function audioUrlToPublic(localPath) {
  const filename = path.basename(localPath);
  const baseUrl = (process.env.APP_URL || '').replace(/\/+$/, '');
  return `${baseUrl}/uploads/${filename}`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { generateSong };
