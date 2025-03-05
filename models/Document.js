const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
    originalMessage: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message',
        required: true
    },
    chat: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Chat',
        required: true
    },
    fileUrl: {
        type: String,
        required: true
    },
    fileType: {
        type: String,
        required: true,
        enum: ['image', 'pdf', 'doc', 'other']
    },
    fileName: {
        type: String,
        required: true
    },
    transcription: {
        type: Object, // JSON data from Document AI
        default: {}
    },
    rawText: {
        type: String
    },
    processedAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Document', documentSchema);