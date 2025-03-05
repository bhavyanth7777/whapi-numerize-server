const express = require('express');
const router = express.Router();
const organizationController = require('../controllers/organizationController');

// Get all organizations
router.get('/', organizationController.getAllOrganizations);

// Get single organization
router.get('/:id', organizationController.getOrganizationById);

// Create organization
router.post('/', organizationController.createOrganization);

// Update organization
router.put('/:id', organizationController.updateOrganization);

// Delete organization
router.delete('/:id', organizationController.deleteOrganization);

// Add chat to organization
router.post('/:id/chats/:chatId', organizationController.addChatToOrganization);

// Remove chat from organization
router.delete('/:id/chats/:chatId', organizationController.removeChatFromOrganization);

router.post('/test', (req, res) => {
    console.log('Test route hit');
    res.status(200).json({ message: 'Test successful' });
});

module.exports = router;