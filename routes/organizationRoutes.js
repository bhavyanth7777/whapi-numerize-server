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
router.post('/:organizationId/chats/:chatId', organizationController.addChatToOrganization);

// Remove chat from organization
router.delete('/:organizationId/chats/:chatId', organizationController.removeChatFromOrganization);

module.exports = router;