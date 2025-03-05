// server/routes/webhookRoutes.js
const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const Chat = require('../models/Chat');
const Document = require('../models/Document');
const whapiService = require('../services/whapiService');
const documentAiService = require('../services/documentAiService');

/**
 * Webhook endpoint for Whapi.cloud
 * Handles incoming messages and events from WhatsApp
 */
router.post('/', async (req, res) => {
    try {
        // Acknowledge the webhook immediately
        res.status(200).send('OK');

        const webhook = req.body;

        // Check if this is a message event
        if (webhook.event === 'message') {
            await processMessage(webhook.data, req.io);
        } else if (webhook.event === 'status') {
            // Handle status updates (delivered, read, etc.)
            console.log('Status update:', webhook.data);
        } else {
            console.log('Other webhook event:', webhook.event);
        }
    } catch (error) {
        console.error('Error processing webhook:', error);
        // We've already sent a 200 response, so just log the error
    }
});

/**
 * Process an incoming message from WhatsApp
 * @param {Object} messageData - The message data from WhatsApp
 * @param {Object} io - Socket.io instance for real-time updates
 */
async function processMessage(messageData, io) {
    try {
        // Extract chat ID and message details
        const chatId = messageData.chatId;

        // Find or create chat
        let chat = await Chat.findOne({ chatId });

        if (!chat) {
            // Get chat info from Whapi
            const whapiChat = await whapiService.getChatInfo(chatId);

            chat = new Chat({
                chatId: whapiChat.id,
                name: whapiChat.name || whapiChat.subject || `Chat with ${whapiChat.id}`,
                isGroup: whapiChat.isGroup || false,
                participants: whapiChat.participants || [],
                profilePicture: whapiChat.profilePictureUrl || ''
            });

            await chat.save();

            // Emit new chat event
            io.emit('new_chat', chat);
        }

        // Check if message already exists
        let message = await Message.findOne({ messageId: messageData.id });

        if (!message) {
            // Create new message
            message = new Message({
                messageId: messageData.id,
                chat: chat._id,
                sender: messageData.sender || 'unknown',
                content: messageData.text || '',
                mediaType: messageData.mediaType || 'none',
                mediaUrl: messageData.mediaUrl || '',
                quoteId: messageData.quotedMsgId || null,
                mentions: messageData.mentions || [],
                reactions: messageData.reactions || [],
                timestamp: messageData.timestamp || new Date()
            });

            await message.save();

            // Update chat's last message
            chat.lastMessage = message._id;
            await chat.save();

            // Emit new message event
            io.to(chatId).emit('new_message', message);

            // Process media if present
            if (message.mediaType === 'image' || message.mediaType === 'document') {
                // Process in background to avoid blocking
                processMediaDocument(message, chat, io);
            }
        }
    } catch (error) {
        console.error('Error processing message:', error);
    }
}

/**
 * Process media from a message
 * @param {Object} message - The message object with media
 * @param {Object} chat - The chat object
 * @param {Object} io - Socket.io instance for real-time updates
 */
async function processMediaDocument(message, chat, io) {
    try {
        // Emit processing started event
        io.to(chat.chatId).emit('document_processing', { messageId: message._id });

        let fileType;
        let mimeType;

        // Determine file type and MIME type
        if (message.mediaType === 'image') {
            fileType = 'image';
            mimeType = 'image/jpeg'; // Assuming JPEG
        } else {
            // Determine from extension
            const fileExt = message.mediaUrl.split('.').pop().toLowerCase();

            if (fileExt === 'pdf') {
                fileType = 'pdf';
                mimeType = 'application/pdf';
            } else if (['doc', 'docx'].includes(fileExt)) {
                fileType = 'doc';
                mimeType = 'application/msword';
            } else {
                fileType = 'other';
                mimeType = 'application/octet-stream';
            }
        }

        // Download media
        const fileBuffer = await whapiService.downloadMedia(message.mediaUrl);

        // Process with Document AI
        const processedDocument = await documentAiService.processDocument(fileBuffer, mimeType);

        // Create document record
        const document = new Document({
            originalMessage: message._id,
            chat: chat._id,
            fileUrl: message.mediaUrl,
            fileType: fileType,
            fileName: `file_${message._id}.${fileType}`,
            transcription: processedDocument,
            rawText: processedDocument.text || ''
        });

        await document.save();

        // Emit document processed event
        io.to(chat.chatId).emit('document_processed', {
            messageId: message._id,
            documentId: document._id
        });
    } catch (error) {
        console.error(`Error processing media document for message ${message._id}:`, error);

        // Emit error event
        io.to(chat.chatId).emit('document_processing_error', {
            messageId: message._id,
            error: error.message
        });
    }
}

module.exports = router;

// server/app.js (add webhook routes)
// Add this line with the other route imports
const webhookRoutes = require('./routes/webhookRoutes');

// Add this line with the other route declarations
app.use('/webhook', webhookRoutes);