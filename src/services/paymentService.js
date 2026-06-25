const axios = require('axios');
const pool = require('../db/pool');

const FLW_BASE = 'https://api.flutterwave.com/v3';
const HEADERS = {
  Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
  'Content-Type': 'application/json',
};

const PRICE_TIERS = {
  // Flyer pricing
  church: 1000,
  business_advert: 1000,
  customer_appreciation: 1000,
  political: 1000,
  // Music pricing
  music_quick: 1000,        // English or Pidgin only
  music_premium: 1500,      // Igbo, Yoruba, Mix, Voice clone
  // Bundle
  bundle: 2000,
};
const DEFAULT_PRICE_NGN = 700;

function getPriceForCategory(category) {
  return PRICE_TIERS[category] || DEFAULT_PRICE_NGN;
}

async function initializePayment({ phone, sessionId, category }) {
  const reference = `NMB-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  const amount = getPriceForCategory(category);

  const { data } = await axios.post(`${FLW_BASE}/payments`, {
    tx_ref: reference,
    amount,
    currency: 'NGN',
    // Force bank transfer as the first option shown to the user.
    // Flutterwave respects the order: first item in the string
    // is the default tab that opens on the payment page.
    payment_options: 'banktransfer, card, ussd',
    redirect_url: `${process.env.APP_URL}/payment/callback`,
    customer: {
      email: `${phone.replace('+', '')}@naijameme.bot`,
      phonenumber: phone,
      name: phone,
    },
    meta: { phone, session_id: sessionId },
    customizations: {
      title: 'NaijaMeme Bot',
      description: category.startsWith('music')
        ? 'Generate your personalised Nigerian song'
        : category === 'bundle'
        ? 'Flyer + Song bundle'
        : 'Generate your custom Naija flyer',
    },
  }, { headers: HEADERS });

  await pool.query(
    `INSERT INTO payments (phone, session_id, reference, amount, status, gateway)
     VALUES ($1, $2, $3, $4, 'pending', 'flutterwave')`,
    [phone, sessionId, reference, amount]
  );

  return { reference, paymentUrl: data.data.link, amount };
}

async function verifyPayment(reference) {
  const { data } = await axios.get(
    `${FLW_BASE}/transactions/verify_by_reference?tx_ref=${reference}`,
    { headers: HEADERS }
  );

  const tx = data.data;

  const expectedResult = await pool.query(
    `SELECT amount FROM payments WHERE reference = $1`,
    [reference]
  );
  const expectedAmount = expectedResult.rows[0]?.amount;

  const success = tx?.status === 'successful' && expectedAmount && tx?.amount >= expectedAmount;

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

module.exports = { initializePayment, verifyPayment, getPriceForCategory };
