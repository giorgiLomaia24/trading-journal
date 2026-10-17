const express = require('express');
const router = express.Router();
const { createStrategy, getStrategies, getStrategyById, updateStrategy, deleteStrategy, getStrategyRules } = require('../controllers/strategyController');
const authMiddleware = require('../middlewares/authMiddleware');

// ყველა მარშრუტი დაცულია ავტორიზაციის ფენით
router.post('/', authMiddleware, createStrategy);       // Create
router.get('/', authMiddleware, getStrategies);        // Read All
router.get('/:id', authMiddleware, getStrategyById);  // Read Single
router.put('/:id', authMiddleware, updateStrategy);   // Update
router.delete('/:id', authMiddleware, deleteStrategy); // Delete
router.get('/:id/rules', authMiddleware, getStrategyRules);

module.exports = router;
