const express = require('express');
const router = express.Router();
const {
  register,
  login,
  forgotPassword,
  resetPassword,
  updateProfileName,
  changePassword,
  savePreferences,
  exportMyData,
  deleteUserAccount
} = require('../controllers/authController');
const authMiddleware = require('../middlewares/authMiddleware');

// საჯარო მარშრუტები
router.post('/register', register);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// დაცული მარშრუტები (ტოკენი სავალდებულოა)
router.put('/profile/name', authMiddleware, updateProfileName);
router.put('/profile/password', authMiddleware, changePassword);
router.put('/preferences', authMiddleware, savePreferences);
router.get('/export', authMiddleware, exportMyData);
router.delete('/account', authMiddleware, deleteUserAccount);

module.exports = router;