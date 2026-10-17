require('dotenv').config(); 

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('../src/config/db');
const authRoutes = require('../src/routes/authRoutes');
const accountRoutes = require('../src/routes/accountRoutes'); 
const strategyRoutes = require('../src/routes/strategyRoutes');
const tradeRoutes = require('../src/routes/tradeRoutes');
const analyticsRoutes = require('../src/routes/analyticsRoutes');
const uploadRoutes = require('../src/routes/uploadRoutes'); 
const sessionRoutes = require('../src/routes/sessionRoutes');

dotenv.config();
const app = express();

// განახლებული CORS კონფიგურაცია ვერსელისთვის
app.use(cors({
  origin: 'https://trading-journal-fhsw-one.vercel.app', // შენი ფრონტენდის რეალური მისამართი
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  credentials: true // თუ ავტორიზაციისთვის ქუქიებს ან ტოკენებს იყენებ
}));

// Preflight მოთხოვნების (OPTIONS) ავტომატური გატარება ყველა ენდპოინტზე
app.options('*', cors());

app.use(express.json());

connectDB();

// ენდპოინტები
app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/strategies', strategyRoutes); 
app.use('/api/trades', tradeRoutes); 
app.use('/api/analytics', analyticsRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/upload', uploadRoutes);

app.get('/', (req, res) => {
  res.json({ message: "Yonko Trading Journal API მუშაობს წარმატებით!" });
});

const PORT = process.env.PORT || 5000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => console.log(`🚀 სერვერი ჩაირთო პორტზე: ${PORT}`));
}

module.exports = app;
