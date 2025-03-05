// server/models/SystemInfo.js
const mongoose = require('mongoose');

const systemInfoSchema = new mongoose.Schema({
    whatsappAccount: {
        type: String,
        default: 'Unknown'
    },
    profileIcon: {
        type: String,
        default: null
    },
    whapiStatus: {
        type: String,
        default: 'Unknown'
    },
    documentAIStatus: {
        type: String,
        default: 'Unknown'
    },
    lastSync: {
        type: Date,
        default: Date.now
    },
    stats: {
        chats: {
            type: Number,
            default: 0
        },
        groups: {
            type: Number,
            default: 0
        },
        documents: {
            type: Number,
            default: 0
        }
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('SystemInfo', systemInfoSchema);