// server/controllers/systemController.js
const whapiService = require('../services/whapiService');
const Chat = require('../models/Chat');
const Document = require('../models/Document');
const SystemInfo = require('../models/SystemInfo');

// Get system information from database or update it if forced
exports.getSystemInfo = async (req, res) => {
    try {
        const forceUpdate = req.query.forceUpdate === 'true';

        // Try to get existing system info from database
        let systemInfo = await SystemInfo.findOne();

        // If no system info exists, or forceUpdate is true, fetch fresh data
        if (!systemInfo || forceUpdate) {
            const updatedInfo = await updateSystemInfo();
            res.status(200).json(updatedInfo);
        } else {
            res.status(200).json(systemInfo);
        }
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

// Update system info in the database
async function updateSystemInfo() {
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
        let lastSyncDate = null;
        try {
            const latestChat = await Chat.findOne().sort({ updatedAt: -1 });
            if (latestChat) {
                lastSyncDate = latestChat.updatedAt;
            }
        } catch (err) {
            console.error('Error finding last sync date:', err);
        }

        const systemInfoData = {
            whatsappAccount: profileInfo.name || 'Unknown',
            profileIcon: profileInfo.icon || null,
            whapiStatus: 'Active', // Assuming it's active if we can call the API
            documentAIStatus: process.env.DOCUMENT_AI_PROJECT_ID ? 'Configured' : 'Not Configured',
            lastSync: lastSyncDate,
            stats: {
                chats: individualChats.length,
                groups: whapiGroups.length,
                documents: documentCount
            },
            lastUpdated: new Date()
        };

        // Update or create the system info in database
        let systemInfo = await SystemInfo.findOne();

        if (systemInfo) {
            // Update existing document
            systemInfo.whatsappAccount = systemInfoData.whatsappAccount;
            systemInfo.profileIcon = systemInfoData.profileIcon;
            systemInfo.whapiStatus = systemInfoData.whapiStatus;
            systemInfo.documentAIStatus = systemInfoData.documentAIStatus;
            systemInfo.lastSync = systemInfoData.lastSync;
            systemInfo.stats = systemInfoData.stats;
            systemInfo.lastUpdated = systemInfoData.lastUpdated;

            await systemInfo.save();
        } else {
            // Create new document
            systemInfo = await SystemInfo.create(systemInfoData);
        }

        return systemInfo;
    } catch (error) {
        console.error('Error updating system info:', error);
        throw error;
    }
}

// Force update system info (exposed as API endpoint)
exports.updateSystemInfo = async (req, res) => {
    try {
        const updatedInfo = await updateSystemInfo();
        res.status(200).json(updatedInfo);
    } catch (error) {
        console.error('Error in updateSystemInfo:', error);
        res.status(500).json({ message: error.message });
    }
};