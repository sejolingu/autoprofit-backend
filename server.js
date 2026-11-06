const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const app = express();

app.use(cors());
app.use(express.json());

const PALPLUSS_KEY = process.env.PALPLUSS_KEY;

// --- FIX 1: PERSISTENT WALLET - survives Render restart ---
let wallet = { KES: 0, USD: 0, EUR: 0, GBP: 0, JPY: 0, USDT: 0 };
let transactions = [];
try {
  if (fs.existsSync('wallet.json')) {
    const d = JSON.parse(fs.readFileSync('wallet.json','utf8'));
    wallet = d.wallet || wallet;
    transactions = d.transactions || [];
  }
} catch(e){}
function saveWallet(){
  fs.writeFileSync('wallet.json', JSON.stringify({wallet, transactions}));
}

app.get('/', (req, res) => {
  res.send('AutoProfit Backend is Live');
});

app.get('/api/wallet', (req, res) => {
  res.json({ wallet, transactions });
});

// DEPOSIT - CALLS PALPLUSS FOR REAL, DOES NOT CREDIT YET
async function doDeposit(req, res) {
  try {
    const { amount, currency, phone } = req.body;
    const amt = Number(amount) || 0;
    const cur = currency || 'KES';
    let rawPhone = (phone || req.body.phoneNumber || '254116125930').toString();
    let cleanPhone = rawPhone.replace(/\s/g, '');
    if (cleanPhone.startsWith('0')) cleanPhone = '254' + cleanPhone.slice(1);
    if (cleanPhone.startsWith('+')) cleanPhone = cleanPhone.slice(1);

    console.log('DEPOSIT REQUEST:', { amt, cur, cleanPhone });

    if (!PALPLUSS_KEY) {
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
    return res.json({ success: true, message: 'STK Sent', ref: ref, palpluss: response.data, wallet });

  } catch (error) {
    console.log('PALPLUSS ERROR:', error.response?.data || error.message);
    return res.status(500).json({ success: false, error: 'STK failed', details: error.response?.data || error.message });
  }
}

app.post('/api/deposit', doDeposit);
app.post('/api/pay', doDeposit);

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
  saveWallet();
  res.json({ success: true, wallet });
});

// CALLBACK FROM PALPLUSS - ONLY HERE DO WE ADD MONEY
app.post('/api/callback', (req, res) => {
  console.log('CALLBACK:', JSON.stringify(req.body));
  const b = req.body || {};
  const status = (b.status || b.ResultDesc || '').toString().toLowerCase();
  const isSuccess = status === 'success' || b.ResultCode === 0 || b.success === true || b.status === 'completed' || status.includes('success');

  if (isSuccess) {
    const amt = Number(b.amount || b.Amount || b.data?.amount || 0);
    // FIX 2: Use ref to stop double-credit
    const ref = b.reference || b.accountReference || b.ref || b.transaction_id || b.id || b.ReceiptNo || b.Receipt || 'CB-' + Date.now();
    if (amt > 0) {
      if (transactions.find(t => t.ref === ref)) {
        console.log('Already credited, skipping:', ref);
        return res.json({ status: 'ok', note: 'already credited' });
      }
      wallet.KES += amt;
      transactions.unshift({ type: 'deposit', amount: amt, currency: 'KES', date: new Date().toISOString(), via: 'M-Pesa', ref: ref });
      saveWallet();
      console.log('CREDITED:', amt, 'New balance:', wallet.KES);
    }
  }
  res.json({ status: 'ok' });
});

// --- FIX 3: MANUAL CREDIT - FOR YOUR PAL-1793815737101 KES 5 ---
app.post('/api/manual-credit', (req, res) => {
  const { ref, amount, phone } = req.body;
  if (!ref || !amount) return res.json({ error: 'Need ref and amount' });
  if (transactions.find(t => t.ref === ref)) return res.json({ error: 'Already credited', wallet });
  wallet.KES += Number(amount);
  transactions.unshift({ type: 'deposit', amount: Number(amount), currency: 'KES', date: new Date().toISOString(), via: 'manual-link', ref: ref, phone: phone || '' });
  saveWallet();
  res.json({ ok: true, wallet });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Running on ' + PORT));
