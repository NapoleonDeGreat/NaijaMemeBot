const axios = require('axios');
const pool = require('../db/pool');

const FLW_BASE = 'https://api.flutterwave.com/v3';
const HEADERS = {
  Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
  'Content-Type': 'application/json',
};

// Tiered pricing: church/business/political flyers go through the
// heaviest pipeline (live web-search design research, multi-photo
// positioning logic, higher-fidelity edit calls), and serve users
// with higher willingness-to-pay (churches/businesses spending money
// to make money or serve their community). Personal/celebration
// categories are priced lower to stay accessible for individuals.
const PRICE_TIERS = {
  church: 1000,
  business_advert: 1000,
  customer_appreciation: 1000,
  political: 1000,
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

  // Look up the amount we actually expected for THIS reference (set at
  // initialization, tied to the category's price tier at that time),
  // rather than checking against a single global constant. This is the
  // correct way to verify tiered pricing -- a ₦700 payment should not
  // accidentally satisfy a session that was supposed to cost ₦1,000.
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
