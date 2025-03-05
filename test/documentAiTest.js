require('dotenv').config();
const fs = require('fs');
const path = require('path');
const documentAiService = require('../services/documentAiService');

/**
 * Test Google Document AI processing
 * Run with: node test/documentAiTest.js
 */
async function testDocumentAi() {
    try {
        console.log('Testing Google Document AI processing...');

        // Path to a test image or PDF
        const testFilePath = process.argv[2];

        if (!testFilePath) {
            console.error('Please provide a path to a test file. Usage: node test/documentAiTest.js path/to/file.jpg');
            process.exit(1);
        }

        // Read file
        const fileBuffer = fs.readFileSync(testFilePath);

        // Determine mime type based on extension
        const ext = path.extname(testFilePath).toLowerCase();
        let mimeType;

        if (['.jpg', '.jpeg', '.png'].includes(ext)) {
            mimeType = `image/${ext.substring(1)}`;
        } else if (ext === '.pdf') {
            mimeType = 'application/pdf';
        } else if (['.doc', '.docx'].includes(ext)) {
            mimeType = 'application/msword';
        } else {
            mimeType = 'application/octet-stream';
        }

        console.log(`Processing ${testFilePath} (${mimeType})...`);

        // Process with Document AI
        const result = await documentAiService.processDocument(fileBuffer, mimeType);

        console.log('Document AI processing successful!');
        console.log('Extracted text:', result.text.substring(0, 100) + '...');
        console.log('Number of pages:', result.pages.length);
        console.log('Number of detected entities:', result.entities.length);
        console.log('Number of detected tables:', result.tables.length);

        // Save result to file for inspection
        fs.writeFileSync(
            'document-ai-result.json',
            JSON.stringify(result, null, 2)
        );

        console.log('Full result saved to document-ai-result.json');
    } catch (error) {
        console.error('Test failed:', error);
    }
}

testDocumentAi();