const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const app = express();
app.use(cors());
app.use(express.json());
const PALPLUSS_KEY = process.env.PALPLUSS_KEY;

let wallet = { KES: 0, USD: 0, EUR: 0, GBP: 0, JPY: 0, USDT: 0 };
let transactions = [];
try {
  if (fs.existsSync('wallet.json')) {
    const d = JSON.parse(fs.readFileSync('wallet.json','utf8'));
    wallet = d.wallet || wallet;
    transactions = d.transactions || [];
  }
} catch(e){}
function saveWallet(){ fs.writeFileSync('wallet.json', JSON.stringify({wallet, transactions})); }

app.get('/', (req,res)=> res.send('AutoProfit Backend is Live'));
app.get('/api/wallet', (req,res)=> res.json({ wallet, transactions }));

async function doDeposit(req,res){
  try{
    const { amount, currency, phone } = req.body;
    const amt = Number(amount) || 0;
    let cleanPhone = (phone || '254116125930').toString().replace(/\s/g,'');
    if(cleanPhone.startsWith('0')) cleanPhone = '254' + cleanPhone.slice(1);
    if(cleanPhone.startsWith('+')) cleanPhone = cleanPhone.slice(1);
    if(!PALPLUSS_KEY) return res.status(500).json({ success:false, error:'PALPLUSS_KEY missing' });
    const ref = 'AP' + Date.now();
    const response = await axios.post('https://api.palpluss.com/v1/payments/stk', {
      phone: cleanPhone,
      amount: amt,
      accountReference: ref,
      callbackUrl: 'https://autoprofit-backend-bwm9.onrender.com/api/callback'
    }, { headers:{ 'Authorization': `Basic ${PALPLUSS_KEY}`, 'Content-Type':'application/json' }, timeout:30000 });
    return res.json({ success:true, message:'STK Sent', ref, palpluss: response.data });
  }catch(e){ return res.status(500).json({ success:false, error:'STK failed', details: e.response?.data || e.message }); }
}
app.post('/api/deposit', doDeposit);
app.post('/api/pay', doDeposit);

app.post('/api/withdraw', (req,res)=>{
  const amt = Number(req.body.amount)||0;
  const cur = req.body.currency || 'KES';
  if((wallet[cur]||0) < amt) return res.status(400).json({ error:'Insufficient balance' });
  wallet[cur]-=amt;
  transactions.unshift({ type:'withdraw', amount:amt, currency:cur, date:new Date().toISOString() });
  saveWallet(); res.json({ success:true, wallet });
});

app.post('/api/callback', (req,res)=>{
  const b = req.body || {};
  const status = (b.status || b.ResultDesc || '').toString().toLowerCase();
  const isSuccess = status==='success' || b.ResultCode===0 || b.success===true || b.status==='completed' || status.includes('success');
  if(isSuccess){
    const amt = Number(b.amount || b.Amount || b.data?.amount || 0);
    const ref = b.reference || b.accountReference || b.ref || b.transaction_id || b.id || 'CB-'+Date.now();
    if(amt>0 && !transactions.find(t=>t.ref===ref)){
      wallet.KES += amt;
      transactions.unshift({ type:'deposit', amount:amt, currency:'KES', date:new Date().toISOString(), via:'M-Pesa', ref });
      saveWallet();
    }
  }
  res.json({ status:'ok' });
});

// 1-CLICK CREDIT FOR YOUR KES 5
app.get('/api/credit-5', (req,res)=>{
  const ref = 'PAL-1793815737101';
  if(transactions.find(t=>t.ref===ref)) return res.json({ note:'Already credited', wallet });
  wallet.KES += 5;
  transactions.unshift({ type:'deposit', amount:5, currency:'KES', date:new Date().toISOString(), via:'manual-link', ref });
  saveWallet();
  res.json({ ok:true, message:'KES 5 credited', wallet });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log('Running on '+PORT));
