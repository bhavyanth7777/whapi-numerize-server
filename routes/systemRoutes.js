// server/routes/systemRoutes.js
const express = require('express');
const router = express.Router();
const systemController = require('../controllers/systemController');

// Get system information
router.get('/info', systemController.getSystemInfo);

// Force update system information
router.post('/info/update', systemController.updateSystemInfo);

module.exports = router;