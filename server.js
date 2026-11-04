const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();

app.use(cors());
app.use(express.json());

const PALPLUSS_KEY = process.env.PALPLUSS_KEY;

app.get('/', (req, res) => {
  res.send('AutoProfit Backend is Live');
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
      callback_url: 'https://autoprofit-backend.onrender.com/api/callback'
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
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Running on ' + PORT));
