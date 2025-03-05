// server/routes/chatRoutes.js
const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');

// Get all chats and groups combined
router.get('/', chatController.getAllChats);

// Get individual chats only
router.get('/individual', chatController.getIndividualChats);

// Get groups only
router.get('/groups', chatController.getGroupsOnly);

// Get single chat
router.get('/:id', chatController.getChatById);

// Assign chat to organization
router.post('/assign', chatController.assignToOrganization);

module.exports = router;