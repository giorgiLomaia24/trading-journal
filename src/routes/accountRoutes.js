const express = require('express');
const router = express.Router();
const { createAccount, getAccounts, getAccountById, updateAccount, deleteAccount } = require('../controllers/accountController');
const authMiddleware = require('../middlewares/authMiddleware'); // დამცავი ფენა

// ყველა მარშრუტი დაცულია ტოკენით
router.post('/', authMiddleware, createAccount);       // Create
router.get('/', authMiddleware, getAccounts);        // Read All
router.get('/:id', authMiddleware, getAccountById);  // Read Single
router.put('/:id', authMiddleware, updateAccount);   // Update
router.delete('/:id', authMiddleware, deleteAccount); // Delete

module.exports = router;
