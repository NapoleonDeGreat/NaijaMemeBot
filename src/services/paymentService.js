const axios = require('axios');
const pool = require('../db/pool');

const FLW_BASE = 'https://api.flutterwave.com/v3';
const HEADERS = {
  Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
  'Content-Type': 'application/json',
};

const PRICE_NGN = 500;

async function initializePayment({ phone, sessionId }) {
  const reference = `NMB-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

  const { data } = await axios.post(`${FLW_BASE}/payments`, {
    tx_ref: reference,
    amount: PRICE_NGN,
    currency: 'NGN',
    redirect_url: `${process.env.APP_URL}/payment/callback`,
    customer: {
      email: `${phone.replace('+', '')}@naijameme.bot`,
      phonenumber: phone,
      name: phone,
    },
    meta: { phone, session_id: sessionId },
    customizations: {
      title: 'NaijaMeme Bot',
      description: 'Generate your custom Naija meme',
    },
  }, { headers: HEADERS });

  await pool.query(
    `INSERT INTO payments (phone, session_id, reference, amount, status, gateway)
     VALUES ($1, $2, $3, $4, 'pending', 'flutterwave')`,
    [phone, sessionId, reference, PRICE_NGN]
  );

  return { reference, paymentUrl: data.data.link };
}

async function verifyPayment(reference) {
  const { data } = await axios.get(
    `${FLW_BASE}/transactions/verify_by_reference?tx_ref=${reference}`,
    { headers: HEADERS }
  );

  const tx = data.data;
  const success = tx?.status === 'successful' && tx?.amount >= PRICE_NGN;

  await pool.query(
    `UPDATE payments
     SET status = $1, gateway_response = $2, verified_at = NOW()
     WHERE reference = $3`,
    [success ? 'success' : 'failed', JSON.stringify(tx), reference]
  );

  return {
    success,
    phone: tx?.meta?.phone,
    sessionId: tx?.meta?.session_id,
    reference,
  };
}

module.exports = { initializePayment, verifyPayment };
