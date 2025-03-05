// server/controllers/chatController.js

const Chat = require('../models/Chat');
const whapiService = require('../services/whapiService');

// Get all chats and groups (original method)
exports.getAllChats = async (req, res) => {
    try {
        // Fetch from Whapi API
        const whapiChats = await whapiService.getAllChats();
        const whapiGroups = await whapiService.getAllGroups();

        console.log(`Processing ${whapiChats.length} chats and ${whapiGroups.length} groups`);

        // Combine chats and groups
        const allChats = [...whapiChats, ...whapiGroups];

        // If no chats were found, return an empty array
        if (allChats.length === 0) {
            console.log('No chats or groups found, returning empty array');
            return res.status(200).json([]);
        }

        // Find existing chats in our database
        const chatIds = allChats.map(chat => chat.id).filter(id => id);
        let existingChats = [];

        if (chatIds.length > 0) {
            existingChats = await Chat.find({
                chatId: { $in: chatIds }
            }).populate('organization');

            console.log(`Found ${existingChats.length} existing chats in database`);
        }

        // Create a map for quick lookup
        const chatMap = {};
        existingChats.forEach(chat => {
            chatMap[chat.chatId] = chat;
        });

        // Format and return combined data
        const formattedChats = allChats.map(chat => {
            const existingChat = chatMap[chat.id] || {};

            return {
                chatId: chat.id,
                name: chat.name || chat.subject || `Chat with ${chat.id}`,
                isGroup: chat.type === 'group',
                participants: Array.isArray(chat.participants)
                    ? chat.participants.map(p => typeof p === 'string' ? p : p.id)
                    : [],
                profilePicture: chat.profilePictureUrl || '',
                organization: existingChat.organization || null,
                lastMessageTime: chat.timestamp ? new Date(chat.timestamp * 1000) : new Date(),
                _id: existingChat._id || null
            };
        });

        console.log(`Returning ${formattedChats.length} formatted chats`);
        res.status(200).json(formattedChats);
    } catch (error) {
        console.error('Error in getAllChats:', error);
        res.status(500).json({ message: error.message });
    }
};

// NEW METHOD: Get individual chats only (no groups)
exports.getIndividualChats = async (req, res) => {
    try {
        // Fetch from Whapi API - only chats, no groups
        const whapiChats = await whapiService.getAllChats();

        console.log(`Processing ${whapiChats.length} individual chats`);

        // Filter to include only contacts/individuals (not groups)
        const individualChats = whapiChats.filter(chat => chat.type === 'contact');

        // If no chats were found, return an empty array
        if (individualChats.length === 0) {
            console.log('No individual chats found, returning empty array');
            return res.status(200).json([]);
        }

        // Find existing chats in our database
        const chatIds = individualChats.map(chat => chat.id).filter(id => id);
        let existingChats = [];

        if (chatIds.length > 0) {
            existingChats = await Chat.find({
                chatId: { $in: chatIds }
            }).populate('organization');

            console.log(`Found ${existingChats.length} existing individual chats in database`);
        }

        // Create a map for quick lookup
        const chatMap = {};
        existingChats.forEach(chat => {
            chatMap[chat.chatId] = chat;
        });

        // Format and return individual chats data
        const formattedChats = individualChats.map(chat => {
            const existingChat = chatMap[chat.id] || {};

            return {
                chatId: chat.id,
                name: chat.name || chat.subject || `Chat with ${chat.id}`,
                isGroup: false,
                participants: Array.isArray(chat.participants)
                    ? chat.participants.map(p => typeof p === 'string' ? p : p.id)
                    : [],
                profilePicture: chat.profilePictureUrl || '',
                organization: existingChat.organization || null,
                lastMessageTime: chat.timestamp ? new Date(chat.timestamp * 1000) : new Date(),
                _id: existingChat._id || null
            };
        });

        console.log(`Returning ${formattedChats.length} formatted individual chats`);
        res.status(200).json(formattedChats);
    } catch (error) {
        console.error('Error in getIndividualChats:', error);
        res.status(500).json({ message: error.message });
    }
};

// NEW METHOD: Get groups only
exports.getGroupsOnly = async (req, res) => {
    try {
        // Fetch from Whapi API - only groups
        const whapiGroups = await whapiService.getAllGroups();

        console.log(`Processing ${whapiGroups.length} groups`);

        // If no groups were found, return an empty array
        if (whapiGroups.length === 0) {
            console.log('No groups found, returning empty array');
            return res.status(200).json([]);
        }

        // Find existing chats in our database
        const groupIds = whapiGroups.map(group => group.id).filter(id => id);
        let existingGroups = [];

        if (groupIds.length > 0) {
            existingGroups = await Chat.find({
                chatId: { $in: groupIds }
            }).populate('organization');

            console.log(`Found ${existingGroups.length} existing groups in database`);
        }

        // Create a map for quick lookup
        const groupMap = {};
        existingGroups.forEach(group => {
            groupMap[group.chatId] = group;
        });

        // Format and return groups data
        const formattedGroups = whapiGroups.map(group => {
            const existingGroup = groupMap[group.id] || {};

            return {
                chatId: group.id,
                name: group.name || `Group ${group.id}`,
                isGroup: true,
                participants: Array.isArray(group.participants)
                    ? group.participants.map(p => typeof p === 'string' ? p : p.id)
                    : [],
                profilePicture: group.profilePictureUrl || '',
                organization: existingGroup.organization || null,
                lastMessageTime: group.timestamp ? new Date(group.timestamp * 1000) : new Date(),
                _id: existingGroup._id || null
            };
        });

        console.log(`Returning ${formattedGroups.length} formatted groups`);
        res.status(200).json(formattedGroups);
    } catch (error) {
        console.error('Error in getGroupsOnly:', error);
        res.status(500).json({ message: error.message });
    }
};

// Get single chat details
exports.getChatById = async (req, res) => {
    try {
        const chatId = req.params.id;

        // First try to get from our database
        let chat = await Chat.findOne({ chatId }).populate('organization');

        // Fetch latest data from Whapi
        const whapiChat = await whapiService.getChatInfo(chatId);

        if (!chat) {
            // Create new chat entry if it doesn't exist
            chat = new Chat({
                chatId: whapiChat.id,
                name: whapiChat.name || whapiChat.subject || `Chat with ${whapiChat.id}`,
                isGroup: whapiChat.type === 'group',
                participants: Array.isArray(whapiChat.participants)
                    ? whapiChat.participants.map(p => typeof p === 'string' ? p : p.id)
                    : [],
                profilePicture: whapiChat.profilePictureUrl || ''
            });

            await chat.save();
            console.log(`Created new chat in database: ${chatId}`);
        } else {
            // Update chat with latest info
            chat.name = whapiChat.name || whapiChat.subject || chat.name;
            chat.isGroup = whapiChat.type === 'group';

            if (Array.isArray(whapiChat.participants)) {
                chat.participants = whapiChat.participants.map(p => typeof p === 'string' ? p : p.id);
            }

            chat.profilePicture = whapiChat.profilePictureUrl || chat.profilePicture;

            await chat.save();
            console.log(`Updated existing chat in database: ${chatId}`);
        }

        res.status(200).json(chat);
    } catch (error) {
        console.error(`Error in getChatById for ${req.params.id}:`, error);
        res.status(500).json({ message: error.message });
    }
};

// Assign chat to organization
exports.assignToOrganization = async (req, res) => {
    try {
        const { chatId, organizationId } = req.body;

        if (!chatId || !organizationId) {
            return res.status(400).json({ message: 'Chat ID and Organization ID are required' });
        }

        // Find the chat by chatId
        let chat = await Chat.findOne({ chatId });

        if (!chat) {
            // Get chat info from Whapi and create it
            const whapiChat = await whapiService.getChatInfo(chatId);

            chat = new Chat({
                chatId: whapiChat.id,
                name: whapiChat.name || whapiChat.subject || `Chat with ${whapiChat.id}`,
                isGroup: whapiChat.type === 'group',
                participants: Array.isArray(whapiChat.participants)
                    ? whapiChat.participants.map(p => typeof p === 'string' ? p : p.id)
                    : [],
                profilePicture: whapiChat.profilePictureUrl || ''
            });
        }

        // Update organization
        chat.organization = organizationId;
        await chat.save();

        console.log(`Assigned chat ${chatId} to organization ${organizationId}`);
        res.status(200).json(chat);
    } catch (error) {
        console.error('Error in assignToOrganization:', error);
        res.status(500).json({ message: error.message });
    }
};