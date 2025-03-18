// server/index.js
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const { DocumentProcessorServiceClient } = require('@google-cloud/documentai');
const { Storage } = require('@google-cloud/storage');
const multer = require('multer');

// Load environment variables
dotenv.config();

// Create media directory if it doesn't exist
const mediaDir = path.join(__dirname, 'media');
if (!fs.existsSync(mediaDir)) {
    fs.mkdirSync(mediaDir, { recursive: true });
}

// Create Express app and server
const app = express();
const server = http.createServer(app);

// Setup Socket.io
const io = new Server(server, {
    cors: {
        origin: process.env.CLIENT_URL || 'http://localhost:3000',
        methods: ['GET', 'POST'],
        credentials: true
    }
});

// Environment variables
const PORT = process.env.PORT || 8000;
const WHAPI_TOKEN = process.env.WHAPI_TOKEN;
const WHAPI_BASE_URL = process.env.WHAPI_BASE_URL;
const MONGODB_URI = process.env.MONGODB_URI;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Make io accessible to routes
app.use((req, res, next) => {
    req.io = io;
    next();
});

// ----------------MongoDB Connection------------------------------------------
mongoose.connect(MONGODB_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

// MongoDB Schemas
const organizationSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    description: String,
    chatIds: [String],
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const chatSchema = new mongoose.Schema({
    chatId: {
        type: String,
        required: true,
        unique: true
    },
    name: {
        type: String,
        required: true
    },
    isGroup: {
        type: Boolean,
        default: false
    },
    participants: [String],
    profilePicture: String,
    organization: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const messageSchema = new mongoose.Schema({
    messageId: {
        type: String,
        required: true,
        unique: true
    },
    chatId: {
        type: String,
        required: true
    },
    sender: String,
    content: String,
    mediaType: {
        type: String,
        enum: ['none', 'image', 'video', 'audio', 'document'],
        default: 'none'
    },
    mediaUrl: String,
    timestamp: {
        type: Date,
        default: Date.now
    }
});

const documentSchema = new mongoose.Schema({
    originalMessageId: {
        type: String,
        required: true
    },
    chatId: {
        type: String,
        required: true
    },
    fileUrl: String,
    fileType: String,
    fileName: String,
    rawText: String,
    processedAt: {
        type: Date,
        default: Date.now
    }
});

const systemInfoSchema = new mongoose.Schema({
    whatsappAccount: String,
    profileIcon: String,
    whapiStatus: String,
    documentAIStatus: String,
    lastSync: Date,
    stats: {
        chats: Number,
        groups: Number,
        documents: Number
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
});

// Create models
const Organization = mongoose.model('Organization', organizationSchema);
const Chat = mongoose.model('Chat', chatSchema);
const Message = mongoose.model('Message', messageSchema);
const Document = mongoose.model('Document', documentSchema);
const SystemInfo = mongoose.model('SystemInfo', systemInfoSchema);

// Utility function to make Whapi API calls
const whapiRequest = async (endpoint, method = 'get', data = null) => {
    try {
        const config = {
            method,
            url: `${WHAPI_BASE_URL}${endpoint}`,
            headers: {
                'Authorization': `Bearer ${WHAPI_TOKEN}`,
                'Content-Type': 'application/json'
            }
        };

        if (data && (method === 'post' || method === 'put')) {
            config.data = data;
        }

        const response = await axios(config);
        return response.data;
    } catch (error) {
        console.error(`Whapi API Error (${endpoint}):`, error.response?.data || error.message);
        throw error;
    }
};

// Google Document AI processing utility
const processDocumentWithAI = async (fileBuffer, fileName) => {
    try {
        const projectId = process.env.DOCUMENT_AI_PROJECT_ID;
        const location = process.env.DOCUMENT_AI_LOCATION;
        const processorId = process.env.DOCUMENT_AI_PROCESSOR_ID;

        const documentaiClient = new DocumentProcessorServiceClient();
        const name = `projects/${projectId}/locations/${location}/processors/${processorId}`;

        // Get file MIME type based on extension
        const getFileMimeType = (filename) => {
            const extension = path.extname(filename).toLowerCase();
            switch (extension) {
                case '.pdf': return 'application/pdf';
                case '.jpg':
                case '.jpeg': return 'image/jpeg';
                case '.png': return 'image/png';
                case '.tiff': return 'image/tiff';
                case '.gif': return 'image/gif';
                case '.bmp': return 'image/bmp';
                default: return 'application/octet-stream';
            }
        };

        const mimeType = getFileMimeType(fileName);
        
        // Process the document
        const [result] = await documentaiClient.processDocument({
            name,
            rawDocument: {
                content: fileBuffer,
                mimeType: mimeType,
            }
        });

        const document = result.document;
        
        // Create a structured object from the parsed entities
        const parsedData = {};
        
        if (document.entities && document.entities.length > 0) {
            document.entities.forEach(entity => {
                if (entity.type && entity.mentionText) {
                    parsedData[entity.type] = entity.mentionText;
                }
            });
        }
        
        // Include raw text from the document in case it's needed
        const rawText = document.text;
        
        return {
            parsedData,
            rawText,
            confidence: document.textStyles?.length 
                ? document.textStyles.reduce((sum, style) => sum + style.confidence, 0) / document.textStyles.length 
                : null
        };
    } catch (error) {
        console.error('Document AI processing error:', error);
        throw error;
    }
};

// API Routes

// Organization Routes
app.get('/api/organizations', async (req, res) => {
    try {
        const organizations = await Organization.find();
        res.status(200).json(organizations);
    } catch (error) {
        console.error('Error getting organizations:', error);
        res.status(500).json({ message: 'Failed to get organizations' });
    }
});

app.get('/api/organizations/:id', async (req, res) => {
    try {
        const organization = await Organization.findById(req.params.id);
        if (!organization) {
            return res.status(404).json({ message: 'Organization not found' });
        }
        res.status(200).json(organization);
    } catch (error) {
        console.error(`Error getting organization ${req.params.id}:`, error);
        res.status(500).json({ message: 'Failed to get organization' });
    }
});

app.post('/api/organizations', async (req, res) => {
    try {
        const { name, description } = req.body;
        const organization = new Organization({
            name,
            description: description || '',
            chatIds: []
        });
        const savedOrg = await organization.save();
        res.status(201).json(savedOrg);
    } catch (error) {
        console.error('Error creating organization:', error);
        res.status(500).json({ message: 'Failed to create organization' });
    }
});

app.put('/api/organizations/:id', async (req, res) => {
    try {
        const { name, description } = req.body;
        const organization = await Organization.findById(req.params.id);

        if (!organization) {
            return res.status(404).json({ message: 'Organization not found' });
        }

        if (name) organization.name = name;
        if (description !== undefined) organization.description = description;

        const updatedOrg = await organization.save();
        res.status(200).json(updatedOrg);
    } catch (error) {
        console.error(`Error updating organization ${req.params.id}:`, error);
        res.status(500).json({ message: 'Failed to update organization' });
    }
});

app.delete('/api/organizations/:id', async (req, res) => {
    try {
        const organization = await Organization.findById(req.params.id);

        if (!organization) {
            return res.status(404).json({ message: 'Organization not found' });
        }

        await Organization.deleteOne({ _id: organization._id });

        // Update any chats that reference this organization
        await Chat.updateMany(
            { organization: organization._id },
            { $unset: { organization: 1 } }
        );

        res.status(200).json({ message: 'Organization deleted successfully' });
    } catch (error) {
        console.error(`Error deleting organization ${req.params.id}:`, error);
        res.status(500).json({ message: 'Failed to delete organization' });
    }
});

// Add chat to organization
app.post('/api/organizations/:id/chats/:chatId', async (req, res) => {
    try {
        const { id, chatId } = req.params;
        const decodedChatId = decodeURIComponent(chatId);

        const organization = await Organization.findById(id);

        if (!organization) {
            return res.status(404).json({ message: 'Organization not found' });
        }

        if (!organization.chatIds) {
            organization.chatIds = [];
        }

        if (!organization.chatIds.includes(decodedChatId)) {
            organization.chatIds.push(decodedChatId);
            await organization.save();
        }

        // Also update chat record if it exists
        const chat = await Chat.findOne({ chatId: decodedChatId });
        if (chat) {
            chat.organization = organization._id;
            await chat.save();
        }

        res.status(200).json(organization);
    } catch (error) {
        console.error('Error adding chat to organization:', error);
        res.status(500).json({ message: 'Failed to add chat to organization' });
    }
});

// Remove chat from organization
app.delete('/api/organizations/:id/chats/:chatId', async (req, res) => {
    try {
        const { id, chatId } = req.params;
        const decodedChatId = decodeURIComponent(chatId);

        const organization = await Organization.findById(id);

        if (!organization) {
            return res.status(404).json({ message: 'Organization not found' });
        }

        if (organization.chatIds) {
            organization.chatIds = organization.chatIds.filter(id => id !== decodedChatId);
            await organization.save();
        }

        // Also update chat record if it exists
        const chat = await Chat.findOne({ chatId: decodedChatId });
        if (chat && chat.organization && chat.organization.toString() === id) {
            chat.organization = null;
            await chat.save();
        }

        res.status(200).json(organization);
    } catch (error) {
        console.error('Error removing chat from organization:', error);
        res.status(500).json({ message: 'Failed to remove chat from organization' });
    }
});

// ----------------CHAT ROUTES--------------------------------------------------
// Get all Chats information (includes groups)
app.get('/api/chats', async (req, res) => {
    try {
        // Get chats from Whapi
        const whapiChats = await whapiRequest('/chats');
        const chats = whapiChats.chats || [];

        // Find existing chats in our database for org info
        const existingChats = await Chat.find({}).populate('organization');
        const chatMap = {};
        existingChats.forEach(chat => {
            chatMap[chat.chatId] = chat;
        });

        // Format and return data
        const formattedChats = chats.map(chat => ({
            chatId: chat.id,
            name: chat.name || chat.subject || `Chat with ${chat.id}`,
            isGroup: false,
            participants: Array.isArray(chat.participants) ? chat.participants.map(p => typeof p === 'string' ? p : p.id) : [],
            profilePicture: chat.profilePictureUrl || '',
            organization: chatMap[chat.id]?.organization || null,
            _id: chatMap[chat.id]?._id || null
        }));

        res.status(200).json(formattedChats);
    } catch (error) {
        console.error('Error getting chats:', error);
        res.status(500).json({ message: 'Failed to get chats' });
    }
});

app.get('/api/chats/individual', async (req, res) => {
    try {
        // Get chats from Whapi
        const whapiChats = await whapiRequest('/chats');
        const individualChats = (whapiChats.chats || []).filter(chat => chat.type === 'contact');

        // Find existing chats in our database for org info
        const chatIds = individualChats.map(chat => chat.id);
        const existingChats = await Chat.find({ chatId: { $in: chatIds } }).populate('organization');
        const chatMap = {};
        existingChats.forEach(chat => {
            chatMap[chat.chatId] = chat;
        });

        // Format and return data
        const formattedChats = individualChats.map(chat => ({
            chatId: chat.id,
            name: chat.name || chat.subject || `Chat with ${chat.id}`,
            isGroup: false,
            participants: Array.isArray(chat.participants) ? chat.participants.map(p => typeof p === 'string' ? p : p.id) : [],
            profilePicture: chat.profilePictureUrl || '',
            organization: chatMap[chat.id]?.organization || null,
            _id: chatMap[chat.id]?._id || null
        }));

        res.status(200).json(formattedChats);
    } catch (error) {
        console.error('Error getting individual chats:', error);
        res.status(500).json({ message: 'Failed to get individual chats' });
    }
});

app.get('/api/chats/groups', async (req, res) => {
    try {
        // Get groups from Whapi
        const whapiGroups = await whapiRequest('/groups');
        const groups = whapiGroups.groups || [];

        // Find existing groups in our database for org info
        const groupIds = groups.map(group => group.id);
        const existingGroups = await Chat.find({ chatId: { $in: groupIds } }).populate('organization');
        const groupMap = {};
        existingGroups.forEach(group => {
            groupMap[group.chatId] = group;
        });

        // Format and return data
        const formattedGroups = groups.map(group => ({
            chatId: group.id,
            name: group.name || group.subject || `Group ${group.id}`,
            isGroup: true,
            participants: Array.isArray(group.participants) ? group.participants.map(p => typeof p === 'string' ? p : p.id) : [],
            profilePicture: group.profilePictureUrl || group.icon || '',
            organization: groupMap[group.id]?.organization || null,
            _id: groupMap[group.id]?._id || null
        }));

        res.status(200).json(formattedGroups);
    } catch (error) {
        console.error('Error getting groups:', error);
        res.status(500).json({ message: 'Failed to get groups' });
    }
});

app.get('/api/chats/:id', async (req, res) => {
    try {
        const chatId = req.params.id;
        const isGroup = chatId.includes('@g.us');

        // First try to get from our database
        let chat = await Chat.findOne({ chatId }).populate('organization');

        // If not in database or we need fresh data, get from Whapi
        if (!chat) {
            try {
                // Try to get chat info from Whapi
                let whapiChat;

                if (isGroup) {
                    const groupResponse = await whapiRequest(`/group/${chatId}`);
                    whapiChat = {
                        id: groupResponse.id || chatId,
                        name: groupResponse.subject || `Group ${chatId}`,
                        isGroup: true,
                        participants: groupResponse.participants || [],
                        profilePictureUrl: groupResponse.icon || null
                    };
                } else {
                    whapiChat = await whapiRequest(`/chat/${chatId}`);
                }

                // Create new chat entry
                chat = new Chat({
                    chatId: chatId,
                    name: whapiChat.name || whapiChat.subject || `Chat with ${chatId}`,
                    isGroup: isGroup,
                    participants: Array.isArray(whapiChat.participants)
                        ? whapiChat.participants.map(p => typeof p === 'string' ? p : p.id)
                        : [],
                    profilePicture: whapiChat.profilePictureUrl || whapiChat.icon || ''
                });

                await chat.save();
            } catch (whapiError) {
                // If Whapi call fails, create basic entry
                console.log(`Error getting chat info from Whapi for ${chatId}:`, whapiError.message);

                // Return minimal info that won't break the UI
                return res.status(200).json({
                    chatId: chatId,
                    name: isGroup ? `Group ${chatId.split('@')[0]}` : `Chat ${chatId}`,
                    isGroup: isGroup,
                    participants: [],
                    _id: null
                });
            }
        }

        res.status(200).json(chat);
    } catch (error) {
        console.error(`Error getting chat ${req.params.id}:`, error);

        // Return minimal info that won't break the UI
        const chatId = req.params.id;
        const isGroup = chatId.includes('@g.us');

        res.status(200).json({
            chatId: chatId,
            name: isGroup ? `Group ${chatId.split('@')[0]}` : `Chat ${chatId}`,
            isGroup: isGroup,
            participants: [],
            _id: null
        });
    }
});

// Message Routes
app.get('/api/messages/:chatId', async (req, res) => {
    try {
        const chatId = req.params.chatId;
        const limit = parseInt(req.query.limit) || 50;

        // Get messages from Whapi
        let endpoint = `/messages/list/${chatId}`;
        if (limit) endpoint += `?count=${limit}`;

        const messages = await whapiRequest(endpoint);

        res.status(200).json(messages);
    } catch (error) {
        console.error(`Error getting messages for chat ${req.params.chatId}:`, error);
        res.status(500).json({ message: 'Failed to get messages' });
    }
});

// Media Routes
// Media download endpoint
app.get('/api/media/:mediaId', async (req, res) => {
    const { mediaId } = req.params;

    try {
        // Check if we already have this file cached
        const mediaPath = path.join(mediaDir, mediaId);

        // If file exists locally, serve it
        if (fs.existsSync(mediaPath)) {
            // For local files, we need to guess the content type
            let contentType = 'application/octet-stream';

            // Read the file and send it
            const fileData = fs.readFileSync(mediaPath);
            res.setHeader('Content-Type', contentType);
            return res.send(fileData);
        }

        // Otherwise, fetch from Whapi
        const response = await axios.get(`${WHAPI_BASE_URL}/media/${mediaId}`, {
            headers: {
                'Authorization': `Bearer ${WHAPI_TOKEN}`
            },
            responseType: 'arraybuffer'
        });

        // Save to local file system
        fs.writeFileSync(mediaPath, Buffer.from(response.data));

        // Set response headers
        if (response.headers['content-type']) {
            res.setHeader('Content-Type', response.headers['content-type']);
        }

        // Send response
        res.send(response.data);
    } catch (error) {
        console.error(`Error fetching media ${mediaId}:`, error);
        res.status(500).json({
            message: 'Failed to fetch media'
        });
    }
});

// System Routes
app.get('/api/system/info', async (req, res) => {
    try {
        const forceUpdate = req.query.forceUpdate === 'true';

        // Try to get existing system info from database
        let systemInfo = await SystemInfo.findOne();

        // If no system info exists, or forceUpdate is true, fetch fresh data
        if (!systemInfo || forceUpdate) {
            // Get profile information
            const profileInfo = await whapiRequest('/users/profile');

            // Count individual chats
            const whapiChats = await whapiRequest('/chats');
            const individualChats = (whapiChats.chats || []).filter(chat => chat.type === 'contact');

            // Count groups
            const whapiGroups = await whapiRequest('/groups');
            const groups = whapiGroups.groups || [];

            // Count documents
            const documentCount = await Document.countDocuments();

            const systemInfoData = {
                whatsappAccount: profileInfo.name || 'Unknown',
                profileIcon: profileInfo.icon || null,
                whapiStatus: 'Active',
                documentAIStatus: 'Not Configured',
                lastSync: new Date(),
                stats: {
                    chats: individualChats.length,
                    groups: groups.length,
                    documents: documentCount
                },
                lastUpdated: new Date()
            };

            if (systemInfo) {
                // Update existing record
                Object.assign(systemInfo, systemInfoData);
                await systemInfo.save();
            } else {
                // Create new record
                systemInfo = await SystemInfo.create(systemInfoData);
            }
        }

        res.status(200).json(systemInfo);
    } catch (error) {
        console.error('Error getting system info:', error);
        res.status(500).json({ message: 'Failed to get system info' });
    }
});

app.post('/api/system/info/update', async (req, res) => {
    try {
        // Get fresh system info
        const profileInfo = await whapiRequest('/users/profile');

        // Count individual chats
        const whapiChats = await whapiRequest('/chats');
        const individualChats = (whapiChats.chats || []).filter(chat => chat.type === 'contact');

        // Count groups
        const whapiGroups = await whapiRequest('/groups');
        const groups = whapiGroups.groups || [];

        // Count documents
        const documentCount = await Document.countDocuments();

        const systemInfoData = {
            whatsappAccount: profileInfo.name || 'Unknown',
            profileIcon: profileInfo.icon || null,
            whapiStatus: 'Active',
            documentAIStatus: 'Not Configured',
            lastSync: new Date(),
            stats: {
                chats: individualChats.length,
                groups: groups.length,
                documents: documentCount
            },
            lastUpdated: new Date()
        };

        let systemInfo = await SystemInfo.findOne();

        if (systemInfo) {
            // Update existing record
            Object.assign(systemInfo, systemInfoData);
            await systemInfo.save();
        } else {
            // Create new record
            systemInfo = await SystemInfo.create(systemInfoData);
        }

        res.status(200).json(systemInfo);
    } catch (error) {
        console.error('Error updating system info:', error);
        res.status(500).json({ message: 'Failed to update system info' });
    }
});

// Documents Routes
app.get('/api/documents', async (req, res) => {
    try {
        const documents = await Document.find().sort({ processedAt: -1 });
        res.status(200).json(documents);
    } catch (error) {
        console.error('Error getting documents:', error);
        res.status(500).json({ message: 'Failed to get documents' });
    }
});

app.get('/api/documents/:id', async (req, res) => {
    try {
        const document = await Document.findById(req.params.id);

        if (!document) {
            return res.status(404).json({ message: 'Document not found' });
        }

        res.status(200).json(document);
    } catch (error) {
        console.error(`Error getting document ${req.params.id}:`, error);
        res.status(500).json({ message: 'Failed to get document' });
    }
});

app.get('/api/documents/chat/:chatId', async (req, res) => {
    try {
        const documents = await Document.find({ chatId: req.params.chatId });
        res.status(200).json(documents);
    } catch (error) {
        console.error(`Error getting documents for chat ${req.params.chatId}:`, error);
        res.status(500).json({ message: 'Failed to get documents' });
    }
});

// Route to process and analyze a document with Document AI
app.post('/api/documents/analyze/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        if (!fileId) {
            return res.status(400).json({ message: 'File ID is required' });
        }

        // Download the file from WHAPI
        const fileResponse = await axios({
            method: 'get',
            url: `${WHAPI_BASE_URL}/media/${fileId}`,
            headers: {
                'Authorization': `Bearer ${WHAPI_TOKEN}`
            },
            responseType: 'arraybuffer'
        });

        // Get file name from headers or use a default
        const contentDisposition = fileResponse.headers['content-disposition'];
        let fileName = 'document';
        if (contentDisposition) {
            const fileNameMatch = contentDisposition.match(/filename="(.+)"/);
            if (fileNameMatch) {
                fileName = fileNameMatch[1];
            }
        }
        
        // Add an extension based on content type if not present
        const contentType = fileResponse.headers['content-type'];
        if (!fileName.includes('.')) {
            if (contentType.includes('pdf')) {
                fileName += '.pdf';
            } else if (contentType.includes('jpeg') || contentType.includes('jpg')) {
                fileName += '.jpg';
            } else if (contentType.includes('png')) {
                fileName += '.png';
            }
        }

        // Process the document with Google Document AI
        const documentAIResult = await processDocumentWithAI(fileResponse.data, fileName);

        // Return the processing results
        res.status(200).json({
            fileName,
            mimeType: contentType,
            parsedData: documentAIResult.parsedData,
            rawText: documentAIResult.rawText,
            confidence: documentAIResult.confidence
        });
    } catch (error) {
        console.error('Error analyzing document:', error);
        res.status(500).json({ 
            message: 'Failed to analyze document',
            error: error.message 
        });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok', message: 'Server is running' });
});

// Socket.io connection handler
io.on('connection', (socket) => {
    console.log('New client connected');

    socket.on('join_chat', (chatId) => {
        socket.join(chatId);
        console.log(`Client joined chat: ${chatId}`);
    });

    socket.on('leave_chat', (chatId) => {
        socket.leave(chatId);
        console.log(`Client left chat: ${chatId}`);
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

// Start server
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});