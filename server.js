const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();

app.use(cors());
app.use(express.json());

const PALPLUSS_KEY = process.env.PALPLUSS_KEY;

// --- SIMPLE WALLET STORAGE (in memory) ---
let wallet = { KES: 0, USD: 0, EUR: 0, GBP: 0, JPY: 0, USDT: 0 };
let transactions = [];

app.get('/', (req, res) => {
  res.send('AutoProfit Backend is Live');
});

// WALLET - THIS WAS MISSING!
app.get('/api/wallet', (req, res) => {
  res.json({ wallet, transactions });
});

// DEPOSIT - THIS WAS MISSING!
app.post('/api/deposit', (req, res) => {
  const { amount, currency } = req.body;
  const amt = Number(amount) || 0;
  const cur = currency || 'KES';
  wallet[cur] = (wallet[cur] || 0) + amt;
  transactions.unshift({ type: 'deposit', amount: amt, currency: cur, date: new Date().toISOString() });
  res.json({ success: true, wallet });
});

// WITHDRAW - THIS WAS MISSING!
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

// STK PUSH
app.post('/api/pay', async (req, res) => {
  try {
    const { phone, amount } = req.body;
    let cleanPhone = phone.replace(/\s/g, '');
    if (cleanPhone.startsWith('0')) cleanPhone = '254' + cleanPhone.slice(1);
    if (cleanPhone.startsWith('+')) cleanPhone = cleanPhone.slice(1);

    const response = await axios.post('https://api.palpluss.com/api/v1/stk-push', {
      phone: cleanPhone,
      amount: Number(amount),
      callback_url: 'https://autoprofit-backend-bwm9.onrender.com/api/callback'
    }, {
      headers: {
        'Authorization': `Bearer ${PALPLUSS_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    res.json(response.data);
  } catch (error) {
    console.log(error.response?.data || error.message);
    res.status(500).json({ error: 'STK failed', details: error.response?.data });
  }
});

// CALLBACK FROM PALPLUSS
app.post('/api/callback', (req, res) => {
  console.log('CALLBACK:', req.body);
  // If payment succeeded, add to wallet
  if (req.body.status === 'success' || req.body.ResultCode === 0) {
    const amt = Number(req.body.amount || req.body.Amount || 0);
    if (amt > 0) {
      wallet.KES += amt;
      transactions.unshift({ type: 'deposit', amount: amt, currency: 'KES', date: new Date().toISOString(), via: 'M-Pesa' });
    }
  }
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Running on ' + PORT));
