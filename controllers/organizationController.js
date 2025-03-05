const Organization = require('../models/Organization');
const Chat = require('../models/Chat');

// Get all organizations
exports.getAllOrganizations = async (req, res) => {
    try {
        const organizations = await Organization.find().populate('chats');
        res.status(200).json(organizations);
    } catch (error) {
        console.error('Error in getAllOrganizations:', error);
        res.status(500).json({ message: error.message });
    }
};

// Get single organization
exports.getOrganizationById = async (req, res) => {
    try {
        const organization = await Organization.findById(req.params.id).populate('chats');

        if (!organization) {
            return res.status(404).json({ message: 'Organization not found' });
        }

        res.status(200).json(organization);
    } catch (error) {
        console.error(`Error in getOrganizationById for ${req.params.id}:`, error);
        res.status(500).json({ message: error.message });
    }
};

// Create new organization
exports.createOrganization = async (req, res) => {
    try {
        const { name, description } = req.body;

        if (!name) {
            return res.status(400).json({ message: 'Organization name is required' });
        }

        const organization = new Organization({
            name,
            description: description || ''
        });

        const savedOrganization = await organization.save();
        res.status(201).json(savedOrganization);
    } catch (error) {
        console.error('Error in createOrganization:', error);
        res.status(500).json({ message: error.message });
    }
};

// Update organization
exports.updateOrganization = async (req, res) => {
    try {
        const { name, description } = req.body;

        const organization = await Organization.findById(req.params.id);

        if (!organization) {
            return res.status(404).json({ message: 'Organization not found' });
        }

        if (name) organization.name = name;
        if (description !== undefined) organization.description = description;

        const updatedOrganization = await organization.save();
        res.status(200).json(updatedOrganization);
    } catch (error) {
        console.error(`Error in updateOrganization for ${req.params.id}:`, error);
        res.status(500).json({ message: error.message });
    }
};

// Delete organization
exports.deleteOrganization = async (req, res) => {
    try {
        const organization = await Organization.findById(req.params.id);

        if (!organization) {
            return res.status(404).json({ message: 'Organization not found' });
        }

        // Remove organization reference from chats
        await Chat.updateMany(
            { organization: organization._id },
            { $unset: { organization: 1 } }
        );

        // Replace the deprecated organization.remove() with:
        await Organization.deleteOne({ _id: organization._id });

        res.status(200).json({ message: 'Organization deleted successfully' });
    } catch (error) {
        console.error(`Error in deleteOrganization for ${req.params.id}:`, error);
        res.status(500).json({ message: error.message });
    }
};

// Add chat to organization
exports.addChatToOrganization = async (req, res) => {
    try {
        const { organizationId, chatId } = req.params;

        // Find organization
        const organization = await Organization.findById(organizationId);

        if (!organization) {
            return res.status(404).json({ message: 'Organization not found' });
        }

        // Find chat
        let chat = await Chat.findOne({ chatId });

        if (!chat) {
            // Get chat from Whapi and create it
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

        // Update chat's organization
        chat.organization = organization._id;
        await chat.save();

        // Add chat to organization if not already present
        if (!organization.chats.includes(chat._id)) {
            organization.chats.push(chat._id);
            await organization.save();
        }

        res.status(200).json(organization);
    } catch (error) {
        console.error(`Error in addChatToOrganization for org ${req.params.organizationId} and chat ${req.params.chatId}:`, error);
        res.status(500).json({ message: error.message });
    }
};

// Remove chat from organization
exports.removeChatFromOrganization = async (req, res) => {
    try {
        const { organizationId, chatId } = req.params;

        // Find organization
        const organization = await Organization.findById(organizationId);

        if (!organization) {
            return res.status(404).json({ message: 'Organization not found' });
        }

        // Find chat
        const chat = await Chat.findOne({ chatId });

        if (chat) {
            // Remove organization from chat
            chat.organization = null;
            await chat.save();

            // Remove chat from organization
            organization.chats = organization.chats.filter(
                chatId => !chatId.equals(chat._id)
            );

            await organization.save();
        }

        res.status(200).json(organization);
    } catch (error) {
        console.error(`Error in removeChatFromOrganization for org ${req.params.organizationId} and chat ${req.params.chatId}:`, error);
        res.status(500).json({ message: error.message });
    }
};