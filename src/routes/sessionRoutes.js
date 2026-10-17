const express = require('express');
const router = express.Router();
const { getSessions, createSession } = require('../controllers/sessionController');
const authMiddleware = require('../middlewares/authMiddleware'); // დამცავი ფენა

// ყველა მარშრუტი დაცულია ტოკენით
router.get('/', authMiddleware, getSessions);    // Read All
router.post('/', authMiddleware, createSession); // Create

module.exports = router;