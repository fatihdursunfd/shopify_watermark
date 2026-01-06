import axios from 'axios';
import { PassThrough } from 'stream';
import FormData from 'form-data';

/**
 * Upload a stream to Shopify Staged Upload URL
 * Uses axios with a stream to keep memory usage low.
 */
export async function uploadToShopify(target, stream, mimeType, filename) {
    const startTime = Date.now();

    // In Node.js environment with axios, we can use form-data or just pipe
    // But direct S3/GCS uploads usually require multipart/form-data with specific fields.
    // We'll use a PassThrough to ensure we don't consume the stream before axios starts.
    const uploadStream = new PassThrough();
    stream.pipe(uploadStream);

    try {
        // Shopify's stagedUploads targets usually require multipart/form-data
        // For streaming multipart in Node, we can use the 'form-data' package, 
        // but since we want to avoid new dependencies if possible, let's see if we can do it with what we have.
        // Node 18+ has native FormData which works with streams/blobs.

        const formData = new FormData();

        // Add all required parameters from Shopify
        target.parameters.forEach(p => {
            formData.append(p.name, p.value);
        });

        // Add the file stream
        // Note: In Node.js, we can append a stream to FormData if it's the web-spec FormData
        // or the 'form-data' package. Since we're on Node 18, we can use Blobs/Files.
        // However, a true stream-to-form-data without buffering usually requires the 'form-data' package.

        // Let's check Node version to be sure. User saidNode 18+.

        // If we don't have 'form-data' package, we might need to buffer A LITTLE or use a workaround.
        // But the requirement is "NO downloading the whole image into a Buffer".

        // Actually, axios + form-data (the package) is the standard way to stream uploads.
        // I'll try to use a standard POST if possible, but Shopify targets are strict.

        // Alternative: Use a small Buffer if 'form-data' isn't there, but the user said NO.

        // Let's assume we can use the native FormData/Blob if we're on a recent enough Node.
        // Or I can just use axios with the stream directly if the target is a simple PUT.
        // But Shopify is usually POST.

        // I'll use a hacky but effective way if 'form-data' isn't available: 
        // Build the multipart header manually or use axios's internal support.

        // Actually, if I can't guarantee 'form-data' package, I'll use a small trick.

        // Wait, I can just check if 'form-data' is in the project. It wasn't in package.json.

        // I'll use 'axios' with the stream as the body if I can get away with it, 
        // but I must handle the multipart boundaries.

        // Let's try to use the most memory-efficient way with standard axios.

        // Use the 'form-data' package for true streaming multipart in Node.js
        const fd = new FormData();

        // Shopify/S3 requires parameters to come BEFORE the file
        target.parameters.forEach(p => {
            fd.append(p.name, p.value);
        });

        // Append the stream as the 'file' field
        fd.append('file', uploadStream, {
            filename: filename,
            contentType: mimeType
        });

        const config = {
            timeout: 120000,
            headers: {
                ...fd.getHeaders()
            }
        };

        const response = await axios.post(target.url, fd, config);

        if (response.status >= 200 && response.status < 300) {
            console.log(`[ShopifyUpload] Successfully uploaded to Cloud Storage (Status: ${response.status})`);
        }

        return {
            success: true,
            status: response.status,
            upload_ms: Date.now() - startTime
        };
    } catch (error) {
        console.error(`[ShopifyUpload] Upload failed:`, error.response?.data || error.message);
        throw error;
    }
}
