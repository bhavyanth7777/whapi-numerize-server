// server/routes/systemRoutes.js
const express = require('express');
const router = express.Router();
const systemController = require('../controllers/systemController');

// Get system information
router.get('/info', systemController.getSystemInfo);

module.exports = router;