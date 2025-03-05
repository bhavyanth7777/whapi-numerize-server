const Message = require('../models/Message');
const Chat = require('../models/Chat');
const whapiService = require('../services/whapiService');
const documentAiService = require('../services/documentAiService');
const Document = require('../models/Document');

// Get messages for a chat
exports.getMessages = async (req, res) => {
    try {
        const chatId = req.params.chatId;
        const limit = parseInt(req.query.limit) || 50;
        const before = req.query.before || null;

        // Get chat from database
        let chat = await Chat.findOne({ chatId });

        if (!chat) {
            // Create chat if it doesn't exist
            const whapiChat = await whapiService.getChatInfo(chatId);

            chat = new Chat({
                chatId: whapiChat.id,
                name: whapiChat.name || whapiChat.subject || `Chat with ${whapiChat.id}`,
                isGroup: whapiChat.isGroup || false,
                participants: whapiChat.participants || [],
                profilePicture: whapiChat.profilePictureUrl || ''
            });

            await chat.save();
        }

        // Fetch messages from Whapi
        const whapiMessages = await whapiService.getChatMessages(chatId, limit, before);

        // Format and store messages
        const formattedMessages = [];

        for (const msg of whapiMessages) {
            // Check if message already exists
            let message = await Message.findOne({ messageId: msg.id });

            if (!message) {
                // Create new message
                message = new Message({
                    messageId: msg.id,
                    chat: chat._id,
                    sender: msg.sender || 'unknown',
                    content: msg.text || '',
                    mediaType: msg.mediaType || 'none',
                    mediaUrl: msg.mediaUrl || '',
                    quoteId: msg.quotedMsgId || null,
                    mentions: msg.mentions || [],
                    reactions: msg.reactions || [],
                    timestamp: msg.timestamp || new Date()
                });

                await message.save();

                // Check if media needs to be processed
                if (message.mediaType === 'image' || message.mediaType === 'document') {
                    try {
                        // Process in background to avoid blocking response
                        req.io.to(chatId).emit('document_processing', { messageId: message._id });

                        // Use a separate async function for processing
                        this._processMediaDocument(message, chat);
                    } catch (error) {
                        console.error(`Error processing media for message ${message._id}:`, error);
                    }
                }
            }

            formattedMessages.push(message);
        }

        res.status(200).json(formattedMessages);
    } catch (error) {
        console.error(`Error in getMessages for chat ${req.params.chatId}:`, error);
        res.status(500).json({ message: error.message });
    }
};

// Helper method to process media documents (non-blocking)
exports._processMediaDocument = async (message, chat) => {
    try {
        let fileType;
        let mimeType;

        if (message.mediaType === 'image') {
            fileType = 'image';
            mimeType = 'image/jpeg'; // Assuming JPEG, adjust as needed
        } else if (message.mediaType === 'document') {
            // Determine file type from extension
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
        } else {
            return; // Not a document to process
        }

        // Download media file
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

        // Emit event for real-time updates
        const io = require('../app').io;
        io.to(chat.chatId).emit('document_processed', {
            messageId: message._id,
            documentId: document._id
        });

    } catch (error) {
        console.error(`Error processing document for message ${message._id}:`, error);
    }
};

// Send a message
exports.sendMessage = async (req, res) => {
    try {
        const { chatId } = req.params;
        const {
            text,
            mediaUrl,
            mediaType,
            caption,
            quotedMsgId,
            mentions
        } = req.body;

        let response;

        // Find chat
        let chat = await Chat.findOne({ chatId });

        if (!chat) {
            // Create chat if it doesn't exist
            const whapiChat = await whapiService.getChatInfo(chatId);

            chat = new Chat({
                chatId: whapiChat.id,
                name: whapiChat.name || whapiChat.subject || `Chat with ${whapiChat.id}`,
                isGroup: whapiChat.isGroup || false,
                participants: whapiChat.participants || [],
                profilePicture: whapiChat.profilePictureUrl || ''
            });

            await chat.save();
        }

        // Send the message using Whapi
        if (mediaUrl && mediaType) {
            // Media message
            response = await whapiService.sendMediaMessage(
                chatId,
                mediaUrl,
                caption || '',
                mediaType,
                quotedMsgId || null
            );
        } else if (mentions && mentions.length > 0) {
            // Message with mentions
            response = await whapiService.sendMessageWithMentions(
                chatId,
                text,
                mentions
            );
        } else {
            // Simple text message
            response = await whapiService.sendTextMessage(
                chatId,
                text,
                quotedMsgId || null
            );
        }

        // Create message record
        const message = new Message({
            messageId: response.messageId,
            chat: chat._id,
            sender: response.sender || 'me',
            content: text || caption || '',
            mediaType: mediaType || 'none',
            mediaUrl: mediaUrl || '',
            quoteId: quotedMsgId || null,
            mentions: mentions || [],
            timestamp: new Date()
        });

        await message.save();

        // Update chat's last message
        chat.lastMessage = message._id;
        await chat.save();

        res.status(201).json(message);
    } catch (error) {
        console.error(`Error in sendMessage to ${req.params.chatId}:`, error);
        res.status(500).json({ message: error.message });
    }
};

// React to a message
exports.reactToMessage = async (req, res) => {
    try {
        const { chatId, messageId } = req.params;
        const { emoji } = req.body;

        if (!emoji) {
            return res.status(400).json({ message: 'Emoji is required' });
        }

        // React using Whapi
        await whapiService.reactToMessage(chatId, messageId, emoji);

        // Update message in our database
        const message = await Message.findOne({ messageId });

        if (message) {
            // Add reaction if not already present
            const existingReaction = message.reactions.find(r => r.userId === 'me');

            if (existingReaction) {
                existingReaction.emoji = emoji;
            } else {
                message.reactions.push({
                    userId: 'me',
                    emoji: emoji
                });
            }

            await message.save();
        }

        res.status(200).json({ success: true });
    } catch (error) {
        console.error(`Error in reactToMessage for ${req.params.messageId}:`, error);
        res.status(500).json({ message: error.message });
    }
};