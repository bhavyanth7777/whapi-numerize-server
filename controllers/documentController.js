const Document = require('../models/Document');
const Message = require('../models/Message');
const Chat = require('../models/Chat');
const documentAiService = require('../services/documentAiService');

// Get all documents
exports.getAllDocuments = async (req, res) => {
    try {
        const documents = await Document.find()
            .populate('originalMessage')
            .populate('chat');

        res.status(200).json(documents);
    } catch (error) {
        console.error('Error in getAllDocuments:', error);
        res.status(500).json({ message: error.message });
    }
};

// Get document by ID
exports.getDocumentById = async (req, res) => {
    try {
        const document = await Document.findById(req.params.id)
            .populate('originalMessage')
            .populate('chat');

        if (!document) {
            return res.status(404).json({ message: 'Document not found' });
        }

        res.status(200).json(document);
    } catch (error) {
        console.error(`Error in getDocumentById for ${req.params.id}:`, error);
        res.status(500).json({ message: error.message });
    }
};

// Get documents by chat
exports.getDocumentsByChat = async (req, res) => {
    try {
        const { chatId } = req.params;

        // Find chat first
        const chat = await Chat.findOne({ chatId });

        if (!chat) {
            return res.status(404).json({ message: 'Chat not found' });
        }

        // Find documents for this chat
        const documents = await Document.find({ chat: chat._id })
            .populate('originalMessage')
            .sort({ processedAt: -1 });

        res.status(200).json(documents);
    } catch (error) {
        console.error(`Error in getDocumentsByChat for ${req.params.chatId}:`, error);
        res.status(500).json({ message: error.message });
    }
};

// Process a document manually
exports.processDocument = async (req, res) => {
    try {
        const { messageId } = req.params;

        // Find message
        const message = await Message.findById(messageId).populate('chat');

        if (!message) {
            return res.status(404).json({ message: 'Message not found' });
        }

        // Check if message has media
        if (!message.mediaUrl || (message.mediaType !== 'image' && message.mediaType !== 'document')) {
            return res.status(400).json({ message: 'Message does not contain processable media' });
        }

        // Check if already processed
        const existingDocument = await Document.findOne({ originalMessage: message._id });

        if (existingDocument) {
            return res.status(400).json({
                message: 'Document already processed',
                documentId: existingDocument._id
            });
        }

        // Determine file type and MIME type
        let fileType;
        let mimeType;

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

        // Start processing (respond immediately to avoid timeout)
        res.status(202).json({ message: 'Document processing started' });

        // Process document in background
        try {
            // Download media
            const fileBuffer = await whapiService.downloadMedia(message.mediaUrl);

            // Process with Document AI
            const processedDocument = await documentAiService.processDocument(fileBuffer, mimeType);

            // Create document record
            const document = new Document({
                originalMessage: message._id,
                chat: message.chat._id,
                fileUrl: message.mediaUrl,
                fileType: fileType,
                fileName: `file_${message._id}.${fileType}`,
                transcription: processedDocument,
                rawText: processedDocument.text || ''
            });

            await document.save();

            // Emit real-time update
            req.io.to(message.chat.chatId).emit('document_processed', {
                messageId: message._id,
                documentId: document._id
            });
        } catch (processingError) {
            console.error(`Error processing document for message ${messageId}:`, processingError);

            // Emit error event
            req.io.to(message.chat.chatId).emit('document_processing_error', {
                messageId: message._id,
                error: processingError.message
            });
        }
    } catch (error) {
        console.error(`Error in processDocument for ${req.params.messageId}:`, error);
        res.status(500).json({ message: error.message });
    }
};