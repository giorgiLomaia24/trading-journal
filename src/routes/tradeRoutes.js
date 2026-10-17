const express = require('express');
const router = express.Router();
const { logTrade, getTrades, getTradeById, updateTrade, deleteTrade, getTradesByDate } = require('../controllers/tradeController');
const authMiddleware = require('../middlewares/authMiddleware');

// ყველა მარშრუტი დაცულია ავტორიზაციის ფენით
router.post('/', authMiddleware, logTrade);       // Create
router.get('/', authMiddleware, getTrades);        // Read All
router.get('/:id', authMiddleware, getTradeById);  // Read Single
router.put('/:id', authMiddleware, updateTrade);   // Update
router.delete('/:id', authMiddleware, deleteTrade); // Delete
router.get('/by-date', authMiddleware, getTradesByDate);

module.exports = router;
