const axios = require('axios');

const BASE_URL = `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}`;
const HEADERS = {
  Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
  'Content-Type': 'application/json',
};

async function sendText(to, text) {
  return axios.post(`${BASE_URL}/messages`, {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: text, preview_url: false },
  }, { headers: HEADERS });
}

async function sendButtons(to, body, buttons) {
  return axios.post(`${BASE_URL}/messages`, {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: body },
      action: {
        buttons: buttons.map(b => ({
          type: 'reply',
          reply: { id: b.id, title: b.title },
        })),
      },
    },
  }, { headers: HEADERS });
}

async function sendList(to, headerText, bodyText, buttonLabel, sections) {
  return axios.post(`${BASE_URL}/messages`, {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: headerText },
      body: { text: bodyText },
      action: { button: buttonLabel, sections },
    },
  }, { headers: HEADERS });
}

async function sendImage(to, imageUrl, caption) {
  return axios.post(`${BASE_URL}/messages`, {
    messaging_product: 'whatsapp',
    to,
    type: 'image',
    image: { link: imageUrl, caption: caption || '' },
  }, { headers: HEADERS });
}

async function markRead(messageId) {
  return axios.post(`${BASE_URL}/messages`, {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId,
  }, { headers: HEADERS }).catch(() => {});
}

async function downloadMedia(mediaId) {
  const { data } = await axios.get(
    `https://graph.facebook.com/v19.0/${mediaId}`,
    { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } }
  );
  const response = await axios.get(data.url, {
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
    responseType: 'arraybuffer',
  });
  return { buffer: Buffer.from(response.data), mimeType: data.mime_type };
}

module.exports = { sendText, sendButtons, sendList, sendImage, markRead, downloadMedia };
