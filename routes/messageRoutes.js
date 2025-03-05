const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');

// Get messages for a chat
router.get('/:chatId', messageController.getMessages);

// Send a message
router.post('/:chatId', messageController.sendMessage);

// React to a message
router.post('/:chatId/react/:messageId', messageController.reactToMessage);

module.exports = router;