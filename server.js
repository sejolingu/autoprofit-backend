// server.js - AutoProfit Backend - FULL FIXED
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const app = express();
app.use(cors());
app.use(express.json());

// ===== WALLET STORAGE =====
let wallet = { KES: 0, USD: 0, EUR: 0, GBP: 0, JPY: 0, USDT: 0 };
let transactions = [];
const WALLET_FILE = './wallet.json';

function loadWallet() {
  try {
    if (fs.existsSync(WALLET_FILE)) {
      const d = JSON.parse(fs.readFileSync(WALLET_FILE, 'utf8'));
      if (d.wallet) wallet = { ...wallet, ...d.wallet };
      if (d.transactions) transactions = d.transactions;
      // Backward compat: if file was {KES:5} directly
      if (d.KES !== undefined) wallet.KES = d.KES;
    }
  } catch (e) { console.log('Load wallet error', e.message); }
}
function saveWallet() {
  try { fs.writeFileSync(WALLET_FILE, JSON.stringify({ wallet, transactions }, null, 2)); }
  catch (e) { console.log('Save error', e.message); }
}
loadWallet();
function saveData() { saveWallet(); }

// ===== HEALTH =====
app.get('/', (req, res) => res.json({ status: 'ok', service: 'autoprofit-backend', wallet }));
app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ===== GET WALLET - This is what app calls =====
app.get('/api/wallet', (req, res) => {
  res.json({ wallet, transactions: transactions.slice(-50) });
});

// ===== DEPOSIT WEBHOOK / CALLBACK FROM PALPLUSS =====
// Palpluss will call this. MUST use += and duplicate check
app.post('/api/deposit', (req, res) => {
  const { amount, currency, ref, transaction_id, phone, status } = req.body || {};
  const finalRef = ref || transaction_id || req.body?.ReceiptNo || req.body?.receipt || ('MANUAL-' + Date.now());
  const amt = parseFloat(amount) || 0;
  const cur = (currency || 'KES').toUpperCase();
  if (amt <= 0) return res.json({ success: false, error: 'Invalid amount' });
  // Duplicate check - never credit same ref twice
  if (transactions.find(t => t.ref === finalRef)) {
    return res.json({ success: false, message: 'Already credited', wallet });
  }
  // FIX: ADD, never overwrite
  wallet[cur] = (wallet[cur] || 0) + amt;
  transactions.push({ type: 'deposit', amount: amt, currency: cur, date: new Date().toISOString(), via: 'palpluss-callback', ref: finalRef, phone: phone || '' });
  saveWallet();
  console.log('DEPOSIT credited:', amt, cur, finalRef, 'New KES:', wallet.KES);
  res.json({ success: true, wallet });
});

// Also accept Palpluss callback on other common paths
app.post('/api/callback', (req, res) => {
  req.url = '/api/deposit';
  return app.handle(req, res);
});
app.post('/api/webhook', (req, res) => {
  req.url = '/api/deposit';
  return app.handle(req, res);
});
app.post('/api/palpluss/callback', (req, res) => {
  req.url = '/api/deposit';
  return app.handle(req, res);
});

// ===== MANUAL CREDIT - RECOVER MISSING PAYMENT =====
// Use: GET /api/credit-missing/PAL-1793933003505?amount=5
app.get('/api/credit-missing/:ref', (req, res) => {
  const ref = req.params.ref;
  const amount = parseFloat(req.query.amount) || 5;
  if (transactions.find(t => t.ref === ref)) {
    return res.json({ success: false, message: 'Already credited', wallet });
  }
  wallet.KES = (wallet.KES || 0) + amount;
  transactions.push({ type: 'deposit', amount, currency: 'KES', date: new Date().toISOString(), via: 'manual-recovery', ref });
  saveWallet();
  console.log('MANUAL CREDIT:', amount, ref, 'New KES:', wallet.KES);
  res.json({ success: true, credited: amount, ref, wallet });
});

// ===== WITHDRAW =====
app.post('/api/withdraw', (req, res) => {
  const { phone, amount, currency } = req.body || {};
  const amt = parseFloat(amount) || 0;
  const cur = (currency || 'KES').toUpperCase();
  if (!phone || amt <= 0) return res.json({ success: false, error: 'Phone and amount required' });
  if ((wallet[cur] || 0) < amt) return res.json({ success: false, error: 'Insufficient balance. Have: ' + wallet[cur] });
  // Deduct only after you confirm Palpluss payout succeeds.
  // For now we deduct and log - replace with real Palpluss payout API call if you have it.
  wallet[cur] -= amt;
  transactions.push({ type: 'withdraw', amount: amt, currency: cur, date: new Date().toISOString(), via: 'manual', ref: 'WD-' + Date.now(), phone });
  saveWallet();
  res.json({ success: true, message: 'Withdraw logged. Process payout in Palpluss dashboard.', wallet, palpluss: { transaction_id: 'WD-' + Date.now() } });
});

// ===== PORT =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('AutoProfit backend running on', PORT, 'Wallet KES:', wallet.KES));
