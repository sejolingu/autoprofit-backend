const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();

app.use(cors());
app.use(express.json());

const PALPLUSS_KEY = process.env.PALPLUSS_KEY;

// RESET - Fake 210 removed, start clean
let wallet = { KES: 0, USD: 0, EUR: 0, GBP: 0, JPY: 0, USDT: 0 };
let transactions = [];

app.get('/', (req, res) => {
  res.send('AutoProfit Backend is Live');
});

app.get('/api/wallet', (req, res) => {
  res.json({ wallet, transactions });
});

// DEPOSIT - NOW CALLS PALPLUSS FOR REAL, DOES NOT CREDIT YET
async function doDeposit(req, res) {
  try {
    const { amount, currency, phone } = req.body;
    const amt = Number(amount) || 0;
    const cur = currency || 'KES';
    // Phone comes from frontend, fallback to your number for testing
    let rawPhone = (phone || req.body.phoneNumber || '254116125930').toString();
    let cleanPhone = rawPhone.replace(/\s/g, '');
    if (cleanPhone.startsWith('0')) cleanPhone = '254' + cleanPhone.slice(1);
    if (cleanPhone.startsWith('+')) cleanPhone = cleanPhone.slice(1);

    console.log('DEPOSIT REQUEST:', { amt, cur, cleanPhone });

    if (!PALPLUSS_KEY) {
      console.log('ERROR: PALPLUSS_KEY missing on Render!');
      return res.status(500).json({ success: false, error: 'PALPLUSS_KEY missing on Render. Add it in Environment.' });
    }
    if (amt < 1) return res.status(400).json({ success: false, error: 'Amount too low' });

    const ref = 'AP' + Date.now();
    const response = await axios.post('https://api.palpluss.com/v1/payments/stk', {
      phone: cleanPhone,
      amount: amt,
      accountReference: ref
    }, {
      headers: {
        'Authorization': `Basic ${PALPLUSS_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    console.log('PALPLUSS RESPONSE:', response.data);
    // DO NOT add to wallet here - wait for callback
    return res.json({ success: true, message: 'STK Sent', ref: ref, palpluss: response.data, wallet });

  } catch (error) {
    console.log('PALPLUSS ERROR:', error.response?.data || error.message);
    return res.status(500).json({ success: false, error: 'STK failed', details: error.response?.data || error.message });
  }
}

app.post('/api/deposit', doDeposit);
app.post('/api/pay', doDeposit); // alias so both work

// WITHDRAW
app.post('/api/withdraw', (req, res) => {
  const { amount, currency } = req.body;
  const amt = Number(amount) || 0;
  const cur = currency || 'KES';
  if ((wallet[cur] || 0) < amt) {
    return res.status(400).json({ error: 'Insufficient balance' });
  }
  wallet[cur] -= amt;
  transactions.unshift({ type: 'withdraw', amount: amt, currency: cur, date: new Date().toISOString() });
  res.json({ success: true, wallet });
});

// CALLBACK FROM PALPLUSS - ONLY HERE DO WE ADD MONEY
app.post('/api/callback', (req, res) => {
  console.log('CALLBACK:', JSON.stringify(req.body));
  const b = req.body || {};
  const status = (b.status || b.ResultDesc || '').toString().toLowerCase();
  const isSuccess = status === 'success' || b.ResultCode === 0 || b.success === true || b.status === 'completed';
  if (isSuccess) {
    const amt = Number(b.amount || b.Amount || b.data?.amount || 0);
    if (amt > 0) {
      wallet.KES += amt;
      transactions.unshift({ type: 'deposit', amount: amt, currency: 'KES', date: new Date().toISOString(), via: 'M-Pesa' });
      console.log('CREDITED:', amt, 'New balance:', wallet.KES);
    }
  }
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Running on ' + PORT));
