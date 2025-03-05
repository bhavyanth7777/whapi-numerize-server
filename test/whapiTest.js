require('dotenv').config();
const whapiService = require('../services/whapiService');

/**
 * Test Whapi.cloud API connectivity
 * Run with: node test/whapiTest.js
 */
async function testWhapiConnection() {
    try {
        console.log('Testing Whapi.cloud connection...');

        // Test getting all chats
        console.log('Fetching chats...');
        const chats = await whapiService.getAllChats();
        console.log(`Successfully fetched ${chats.length} chats`);

        // Test getting groups
        console.log('Fetching groups...');
        const groups = await whapiService.getAllGroups();
        console.log(`Successfully fetched ${groups.length} groups`);

        // Test sending a test message to the first chat
        if (chats.length > 0) {
            const testChatId = chats[0].id;
            console.log(`Sending test message to chat ${testChatId}...`);

            const messageResponse = await whapiService.sendTextMessage(
                testChatId,
                'This is a test message from the WhatsApp Management System'
            );

            console.log('Message sent successfully:', messageResponse);
        } else {
            console.log('No chats available to test messaging');
        }

        console.log('All tests passed. Whapi.cloud is configured correctly.');
    } catch (error) {
        console.error('Test failed:', error);
    }
}

testWhapiConnection();