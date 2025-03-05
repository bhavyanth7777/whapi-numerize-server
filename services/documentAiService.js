// server/services/documentAiService.js
const { DocumentProcessorServiceClient } = require('@google-cloud/documentai').v1;
const { Storage } = require('@google-cloud/storage');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

class DocumentAiService {
    constructor() {
        // Initialize Document AI client
        this.documentProcessorClient = new DocumentProcessorServiceClient();

        // Initialize Cloud Storage client
        this.storage = new Storage();

        // Document AI config
        this.projectId = process.env.DOCUMENT_AI_PROJECT_ID;
        this.location = process.env.DOCUMENT_AI_LOCATION;
        this.processorId = process.env.DOCUMENT_AI_PROCESSOR_ID;

        // Format the processor name resource
        this.processorName = this.documentProcessorClient.processorPath(
            this.projectId,
            this.location,
            this.processorId
        );
    }

    /**
     * Process a document with Document AI
     * @param {Buffer} fileBuffer The file buffer to process
     * @param {string} mimeType The MIME type of the file (e.g., 'image/jpeg', 'application/pdf')
     * @returns {Object} The processed document data
     */
    async processDocument(fileBuffer, mimeType) {
        try {
            // Configure the process request
            const request = {
                name: this.processorName,
                rawDocument: {
                    content: fileBuffer,
                    mimeType: mimeType
                }
            };

            // Process the document
            const [result] = await this.documentProcessorClient.processDocument(request);
            const { document } = result;

            // Extract text, entities, and other data
            const processedDocument = {
                text: document.text,
                pages: document.pages.map(page => ({
                    pageNumber: page.pageNumber,
                    width: page.dimension.width,
                    height: page.dimension.height,
                    blocks: this._extractBlocks(page)
                })),
                entities: document.entities ? document.entities.map(entity => ({
                    type: entity.type,
                    mentionText: entity.mentionText,
                    confidence: entity.confidence
                })) : [],
                tables: this._extractTables(document)
            };

            return processedDocument;
        } catch (error) {
            console.error('Error processing document with Document AI:', error);
            throw new Error(`Document AI processing failed: ${error.message}`);
        }
    }

    /**
     * Process a document from a URL
     * @param {string} fileUrl The URL of the file to process
     * @param {string} mimeType The MIME type of the file
     * @returns {Object} The processed document data
     */
    async processDocumentFromUrl(fileUrl, mimeType) {
        try {
            // Download the file
            const response = await fetch(fileUrl);
            if (!response.ok) {
                throw new Error(`Failed to download file: ${response.statusText}`);
            }

            const fileBuffer = await response.arrayBuffer();

            // Process the downloaded document
            return await this.processDocument(Buffer.from(fileBuffer), mimeType);
        } catch (error) {
            console.error('Error processing document from URL:', error);
            throw new Error(`Document processing from URL failed: ${error.message}`);
        }
    }

    /**
     * Save a document to GCS for later reference
     * @param {Buffer} fileBuffer The file buffer to save
     * @param {string} fileName The desired file name
     * @param {string} bucketName The GCS bucket name
     * @returns {string} The public URL of the saved file
     */
    async saveToGCS(fileBuffer, fileName, bucketName) {
        try {
            // Generate a unique file name to prevent collisions
            const uniqueFileName = `${path.parse(fileName).name}-${crypto.randomBytes(8).toString('hex')}${path.extname(fileName)}`;

            // Get a reference to the bucket
            const bucket = this.storage.bucket(bucketName);

            // Create a temporary file
            const tempFilePath = path.join(os.tmpdir(), uniqueFileName);
            fs.writeFileSync(tempFilePath, fileBuffer);

            // Upload the file to GCS
            await bucket.upload(tempFilePath, {
                destination: uniqueFileName,
                metadata: {
                    cacheControl: 'public, max-age=31536000'
                }
            });

            // Delete the temporary file
            fs.unlinkSync(tempFilePath);

            // Make the file publicly accessible
            await bucket.file(uniqueFileName).makePublic();

            // Get the public URL
            const publicUrl = `https://storage.googleapis.com/${bucketName}/${uniqueFileName}`;

            return publicUrl;
        } catch (error) {
            console.error('Error saving file to GCS:', error);
            throw new Error(`File upload to GCS failed: ${error.message}`);
        }
    }

    /**
     * Extract tables from Document AI response
     * @param {Object} document The Document AI document
     * @returns {Array} Extracted tables
     */
    _extractTables(document) {
        if (!document.pages) return [];

        const tables = [];

        document.pages.forEach(page => {
            if (!page.tables) return;

            page.tables.forEach(table => {
                const extractedTable = {
                    rows: [],
                    pageNumber: page.pageNumber
                };

                // Get all header rows
                const headerRows = table.headerRows || [];
                headerRows.forEach(headerRow => {
                    const row = [];
                    headerRow.cells.forEach(cell => {
                        const textAnchor = cell.textAnchor || {};
                        const textSegment = textAnchor.textSegments?.[0] || {};
                        const start = textSegment.startIndex || 0;
                        const end = textSegment.endIndex || 0;

                        row.push({
                            text: document.text.substring(start, end).trim(),
                            rowSpan: cell.rowSpan || 1,
                            colSpan: cell.colSpan || 1
                        });
                    });
                    extractedTable.rows.push({ cells: row, isHeader: true });
                });

                // Get all body rows
                const bodyRows = table.bodyRows || [];
                bodyRows.forEach(bodyRow => {
                    const row = [];
                    bodyRow.cells.forEach(cell => {
                        const textAnchor = cell.textAnchor || {};
                        const textSegment = textAnchor.textSegments?.[0] || {};
                        const start = textSegment.startIndex || 0;
                        const end = textSegment.endIndex || 0;

                        row.push({
                            text: document.text.substring(start, end).trim(),
                            rowSpan: cell.rowSpan || 1,
                            colSpan: cell.colSpan || 1
                        });
                    });
                    extractedTable.rows.push({ cells: row, isHeader: false });
                });

                tables.push(extractedTable);
            });
        });

        return tables;
    }

    /**
     * Extract text blocks from a page
     * @param {Object} page A Document AI page
     * @returns {Array} Extracted text blocks
     */
    _extractBlocks(page) {
        if (!page.blocks) return [];

        return page.blocks.map(block => {
            // Extract layout information
            const boundingPoly = block.layout.boundingPoly || {};
            const normalizedVertices = boundingPoly.normalizedVertices || [];

            // Calculate bounding box
            const bbox = {
                x: normalizedVertices.length > 0 ? normalizedVertices[0].x || 0 : 0,
                y: normalizedVertices.length > 0 ? normalizedVertices[0].y || 0 : 0,
                width: normalizedVertices.length > 1 ?
                    (normalizedVertices[1].x || 0) - (normalizedVertices[0].x || 0) : 0,
                height: normalizedVertices.length > 2 ?
                    (normalizedVertices[2].y || 0) - (normalizedVertices[0].y || 0) : 0
            };

            return {
                bbox,
                type: block.layout.type || 'UNKNOWN',
                confidence: block.layout.confidence || 0
            };
        });
    }
}

module.exports = new DocumentAiService();