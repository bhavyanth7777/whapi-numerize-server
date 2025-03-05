require('dotenv').config();
const axios = require('axios');

/**
 * Setup webhook with Whapi.cloud
 * Run this script after deploying your backend to configure webhooks
 */
async function setupWebhook() {
    const WHAPI_BASE_URL = process.env.WHAPI_BASE_URL;
    const WHAPI_TOKEN = process.env.WHAPI_TOKEN;
    const WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://your-deployed-backend.vercel.app/webhook';

    if (!WHAPI_BASE_URL || !WHAPI_TOKEN || !WEBHOOK_URL) {
        console.error('Missing required environment variables. Please check your .env file.');
        process.exit(1);
    }

    try {
        const response = await axios.post(
            `${WHAPI_BASE_URL}/webhook`,
            { url: WEBHOOK_URL },
            {
                headers: {
                    'Authorization': `Bearer ${WHAPI_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('Webhook setup successful:', response.data);
    } catch (error) {
        console.error('Error setting up webhook:', error.response?.data || error.message);
        process.exit(1);
    }
}

setupWebhook();