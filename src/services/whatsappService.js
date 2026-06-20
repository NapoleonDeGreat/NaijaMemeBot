const axios = require('axios');

const BASE_URL = `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}`;
const HEADERS = {
  Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
  'Content-Type': 'application/json',
};

// WhatsApp Cloud API hard limit: list messages cap at 10 rows TOTAL
// across all sections combined. Exceeding this returns a 400 with no
// useful detail unless we log the response body, so we guard for it
// here and log the real Meta error message everywhere else too.
const MAX_LIST_ROWS = 10;

function logApiError(context, err) {
  const metaError = err.response?.data?.error;
  if (metaError) {
    console.error(`WhatsApp API error [${context}]:`, JSON.stringify({
      message: metaError.message,
      type: metaError.type,
      code: metaError.code,
      error_subcode: metaError.error_subcode,
      error_user_title: metaError.error_user_title,
      error_user_msg: metaError.error_user_msg,
      fbtrace_id: metaError.fbtrace_id,
    }));
  } else {
    console.error(`WhatsApp API error [${context}]:`, err.message);
  }
}

async function sendText(to, text) {
  try {
    return await axios.post(`${BASE_URL}/messages`, {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text, preview_url: false },
    }, { headers: HEADERS });
  } catch (err) {
    logApiError('sendText', err);
    throw err;
  }
}

async function sendButtons(to, body, buttons) {
  try {
    return await axios.post(`${BASE_URL}/messages`, {
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
  } catch (err) {
    logApiError('sendButtons', err);
    throw err;
  }
}

async function sendList(to, headerText, bodyText, buttonLabel, sections) {
  const totalRows = sections.reduce((sum, section) => sum + (section.rows?.length || 0), 0);
  if (totalRows > MAX_LIST_ROWS) {
    const msg = `sendList: ${totalRows} total rows across all sections exceeds WhatsApp's hard limit of ${MAX_LIST_ROWS}. Split into multiple list messages instead.`;
    console.error(msg);
    throw new Error(msg);
  }

  try {
    return await axios.post(`${BASE_URL}/messages`, {
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
  } catch (err) {
    logApiError('sendList', err);
    throw err;
  }
}

async function sendImage(to, imageUrl, caption) {
  try {
    return await axios.post(`${BASE_URL}/messages`, {
      messaging_product: 'whatsapp',
      to,
      type: 'image',
      image: { link: imageUrl, caption: caption || '' },
    }, { headers: HEADERS });
  } catch (err) {
    logApiError('sendImage', err);
    throw err;
  }
}

async function markRead(messageId) {
  return axios.post(`${BASE_URL}/messages`, {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId,
  }, { headers: HEADERS }).catch(err => logApiError('markRead', err));
}

async function downloadMedia(mediaId) {
  try {
    const { data } = await axios.get(
      `https://graph.facebook.com/v19.0/${mediaId}`,
      { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } }
    );
    const response = await axios.get(data.url, {
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
      responseType: 'arraybuffer',
    });
    return { buffer: Buffer.from(response.data), mimeType: data.mime_type };
  } catch (err) {
    logApiError('downloadMedia', err);
    throw err;
  }
}

async function sendTyping(to) {
  // WhatsApp doesn't have a native "typing..." indicator via Cloud API,
  // so we simulate it by sending a read receipt first (shows the bot
  // is active) then a brief delay before the real message. This is the
  // standard pattern used by WhatsApp bots since the typing_on action
  // is only available via the Business Management API, not Cloud API.
  return new Promise(resolve => setTimeout(resolve, 1500));
}

module.exports = { sendText, sendButtons, sendList, sendImage, markRead, downloadMedia, sendTyping };
