const express = require('express');
const router = express.Router();
const documentController = require('../controllers/documentController');

// Get all documents
router.get('/', documentController.getAllDocuments);

// Get document by ID
router.get('/:id', documentController.getDocumentById);

// Get documents by chat
router.get('/chat/:chatId', documentController.getDocumentsByChat);

// Process a document manually
router.post('/process/:messageId', documentController.processDocument);

module.exports = router;