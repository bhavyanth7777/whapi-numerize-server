const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    messageId: {
        type: String,
        required: true,
        unique: true
    },
    chat: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Chat',
        required: true
    },
    sender: {
        type: String,
        required: true
    },
    content: {
        type: String
    },
    mediaType: {
        type: String,
        enum: ['none', 'image', 'video', 'audio', 'document'],
        default: 'none'
    },
    mediaUrl: {
        type: String
    },
    quoteId: {
        type: String // If it's a reply message
    },
    mentions: [{
        type: String // Phone numbers mentioned
    }],
    reactions: [{
        userId: String,
        emoji: String
    }],
    timestamp: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Message', messageSchema);