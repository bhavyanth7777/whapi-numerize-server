// server/controllers/systemController.js

const whapiService = require('../services/whapiService');
const Chat = require('../models/Chat');
const Document = require('../models/Document');

// Get system information including stats
exports.getSystemInfo = async (req, res) => {
    try {
        // Get profile information
        const profileInfo = await whapiService.getProfileInfo();

        // Count individual chats
        const whapiChats = await whapiService.getAllChats();
        const individualChats = whapiChats.filter(chat => chat.type === 'contact');

        // Count groups
        const whapiGroups = await whapiService.getAllGroups();

        // Count documents
        let documentCount = 0;
        try {
            documentCount = await Document.countDocuments();
        } catch (err) {
            console.error('Error counting documents:', err);
        }

        // Get last sync time from the database
        // For this example, we'll use the most recent chat update time
        let lastSyncDate = null;
        try {
            const latestChat = await Chat.findOne().sort({ updatedAt: -1 });
            if (latestChat) {
                lastSyncDate = latestChat.updatedAt;
            }
        } catch (err) {
            console.error('Error finding last sync date:', err);
        }

        // Format last sync date
        const lastSync = lastSyncDate ? new Date(lastSyncDate).toISOString() : null;

        const systemInfo = {
            whatsappAccount: profileInfo.name || 'Unknown',
            profileIcon: profileInfo.icon || null,
            whapiStatus: 'Active', // Assuming it's active if we can call the API
            documentAIStatus: process.env.DOCUMENT_AI_PROJECT_ID ? 'Configured' : 'Not Configured',
            lastSync,
            stats: {
                chats: individualChats.length,
                groups: whapiGroups.length,
                documents: documentCount
            }
        };

        res.status(200).json(systemInfo);
    } catch (error) {
        console.error('Error in getSystemInfo:', error);
        res.status(500).json({
            message: error.message,
            whatsappAccount: 'Unknown',
            profileIcon: null,
            whapiStatus: 'Unknown',
            documentAIStatus: 'Unknown',
            lastSync: null,
            stats: {
                chats: 0,
                groups: 0,
                documents: 0
            }
        });
    }
};