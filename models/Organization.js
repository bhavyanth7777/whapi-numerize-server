// server/models/Organization.js
const mongoose = require('mongoose');

const organizationSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    description: {
        type: String
    },
    chats: [{ // Keep original field for backward compatibility
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Chat'
    }],
    chatIds: [{ // New field to store chat IDs directly
        type: String
    }],
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Organization', organizationSchema);