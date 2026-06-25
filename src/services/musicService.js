const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const BASE_URL = 'https://sunor.cc/api/v1';

function getHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-api-key': process.env.SUNOR_API_KEY,
  };
}

const MAX_POLL_ATTEMPTS = 60;
const POLL_INTERVAL_MS = 5000;

async function generateSong({ sunoPrompt, lyrics, title }) {
  const input = {
    gpt_description_prompt: sunoPrompt,
    make_instrumental: false,
  };

  if (lyrics) {
    input.prompt = lyrics;
    input.mv = 'chirp-v5-5';
  }

  const submitResponse = await axios.post(
    `${BASE_URL}/task`,
    {
      model: 'suno',
      task_type: 'music',
      input,
    },
    { headers: getHeaders() }
  );

  console.log(`Sunor submit response: ${JSON.stringify(submitResponse.data)}`);

  const taskId =
    submitResponse.data?.task_id ||
    submitResponse.data?.data?.task_id ||
    submitResponse.data?.id ||
    submitResponse.data?.data?.id;

  if (!taskId) throw new Error(`Sunor: no task_id in response: ${JSON.stringify(submitResponse.data)}`);

  console.log(`Sunor task submitted: ${taskId}`);

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await sleep(POLL_INTERVAL_MS);

    const pollResponse = await axios.get(
      `${BASE_URL}/task/${taskId}`,
      { headers: getHeaders() }
    );

    const data = pollResponse.data;

    // Log full response on first 3 attempts to see structure
    if (attempt < 3) {
      console.log(`Sunor full response attempt ${attempt + 1}: ${JSON.stringify(data)}`);
    }

    const status =
      data?.status ||
      data?.data?.status ||
      data?.task?.status;

    console.log(`Sunor poll attempt ${attempt + 1}: status=${status}`);

    if (status === 'success') {
      const clips =
        data?.output?.result ||
        data?.data?.output?.result ||
        data?.result ||
        data?.data?.result ||
        data?.clips ||
        data?.data?.clips;

      if (!clips || !clips.length) {
        throw new Error(`Sunor: success but no clips found. Full response: ${JSON.stringify(data)}`);
      }

      const clip = clips[0];
      const audioUrl = clip.audio_url || clip.url || clip.audio;
      if (!audioUrl) throw new Error(`Sunor: no audio_url in clip: ${JSON.stringify(clip)}`);

      const localPath = await downloadAudio(audioUrl);
      const publicUrl = audioUrlToPublic(localPath);

      return {
        audioUrl,
        localPath,
        publicUrl,
        title: clip.title || title || 'Your Song',
        imageUrl: clip.image_url || null,
      };
    }

    if (status === 'failure' || status === 'timeout' || status === 'failed') {
      throw new Error(`Sunor generation ${status}: ${JSON.stringify(data)}`);
    }
  }

  throw new Error('Sunor: generation timed out after 5 minutes');
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
