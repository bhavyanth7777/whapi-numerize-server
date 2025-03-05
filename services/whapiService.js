// server/services/whapiService.js - Updated getAllChats and getAllGroups methods

const axios = require('axios');

class WhapiService {
    constructor() {
        this.baseURL = process.env.WHAPI_BASE_URL;
        this.token = process.env.WHAPI_TOKEN;
        this.client = axios.create({
            baseURL: this.baseURL,
            headers: {
                'Authorization': `Bearer ${this.token}`,
                'Content-Type': 'application/json'
            }
        });
    }

    // Get profile information (including WhatsApp account name)
    async getProfileInfo() {
        try {
            console.log('Fetching profile information from Whapi.cloud...');
            // Use the correct endpoint
            const response = await this.client.get('/users/profile');

            console.log('Profile info response:', response.data);
            return response.data;
        } catch (error) {
            console.error('Error fetching profile information:', error.response?.data || error.message);

            // Return a default object in case of error
            return {
                name: 'Unknown',
                icon: null,
                icon_full: null
            };
        }
    }

    // Get all chats (individual)
    async getAllChats() {
        try {
            console.log('Fetching chats from Whapi.cloud...');
            const response = await this.client.get('/chats');

            // The API returns an object with a "chats" property that contains the array
            if (response.data && Array.isArray(response.data.chats)) {
                console.log(`Successfully retrieved ${response.data.chats.length} chats`);
                return response.data.chats;
            } else {
                console.error('Unexpected response format from /chats endpoint:', response.data);
                return [];
            }
        } catch (error) {
            console.error('Error fetching chats:', error.response?.data || error.message);
            return []; // Return empty array instead of throwing
        }
    }

    // Get all groups
    async getAllGroups() {
        try {
            console.log('Fetching groups from Whapi.cloud...');
            const response = await this.client.get('/groups');

            // The API returns an object with a "groups" property that contains the array
            if (response.data && Array.isArray(response.data.groups)) {
                console.log(`Successfully retrieved ${response.data.groups.length} groups`);
                return response.data.groups;
            } else {
                console.error('Unexpected response format from /groups endpoint:', response.data);
                return [];
            }
        } catch (error) {
            console.error('Error fetching groups:', error.response?.data || error.message);
            return []; // Return empty array instead of throwing
        }
    }

    // Other methods remain the same
    async getChatInfo(chatId) {
        try {
            const response = await this.client.get(`/chat/${chatId}`);
            return response.data;
        } catch (error) {
            console.error(`Error fetching chat ${chatId}:`, error.response?.data || error.message);
            throw new Error(error.response?.data?.message || 'Failed to fetch chat info');
        }
    }

    async getChatMessages(chatId, limit = 50, before = null) {
        try {
            let url = `/messages/${chatId}?limit=${limit}`;
            if (before) {
                url += `&before=${before}`;
            }

            const response = await this.client.get(url);
            return response.data;
        } catch (error) {
            console.error(`Error fetching messages for chat ${chatId}:`, error.response?.data || error.message);
            throw new Error(error.response?.data?.message || 'Failed to fetch messages');
        }
    }

    async sendTextMessage(chatId, message, quotedMsgId = null) {
        try {
            const payload = {
                text: message
            };

            if (quotedMsgId) {
                payload.quoted_msg_id = quotedMsgId;
            }

            const response = await this.client.post(`/message/${chatId}/text`, payload);
            return response.data;
        } catch (error) {
            console.error(`Error sending message to ${chatId}:`, error.response?.data || error.message);
            throw new Error(error.response?.data?.message || 'Failed to send message');
        }
    }

    async sendMediaMessage(chatId, mediaUrl, caption = '', mediaType = 'image', quotedMsgId = null) {
        try {
            const payload = {
                url: mediaUrl,
                caption: caption
            };

            if (quotedMsgId) {
                payload.quoted_msg_id = quotedMsgId;
            }

            const endpoint = `/message/${chatId}/${mediaType}`;
            const response = await this.client.post(endpoint, payload);
            return response.data;
        } catch (error) {
            console.error(`Error sending media to ${chatId}:`, error.response?.data || error.message);
            throw new Error(error.response?.data?.message || 'Failed to send media');
        }
    }

    async reactToMessage(chatId, messageId, emoji) {
        try {
            const payload = {
                emoji: emoji
            };

            const response = await this.client.post(`/message/${chatId}/reaction/${messageId}`, payload);
            return response.data;
        } catch (error) {
            console.error(`Error reacting to message ${messageId}:`, error.response?.data || error.message);
            throw new Error(error.response?.data?.message || 'Failed to react to message');
        }
    }

    async sendMessageWithMentions(chatId, message, mentions = []) {
        try {
            const payload = {
                text: message,
                mentions: mentions
            };

            const response = await this.client.post(`/message/${chatId}/text`, payload);
            return response.data;
        } catch (error) {
            console.error(`Error sending message with mentions to ${chatId}:`, error.response?.data || error.message);
            throw new Error(error.response?.data?.message || 'Failed to send message with mentions');
        }
    }

    async downloadMedia(mediaUrl) {
        try {
            const response = await axios.get(mediaUrl, {
                responseType: 'arraybuffer',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            return response.data;
        } catch (error) {
            console.error(`Error downloading media from ${mediaUrl}:`, error.response?.data || error.message);
            throw new Error('Failed to download media');
        }
    }
}

module.exports = new WhapiService();