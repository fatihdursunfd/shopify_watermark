import { Worker } from 'bullmq';
import { redisConnection } from '../config/redis.js';
import { QUEUE_NAMES, JOB_STATUS, JOB_ITEM_STATUS, SCOPE_TYPE } from '../constants/watermark.js';
import { startJob, completeJob, incrementProcessedProducts, incrementFailedProducts } from '../db/repositories/watermarkJobsRepository.js';
import { createJobItem, markJobItemCompleted, markJobItemFailed } from '../db/repositories/watermarkJobItemsRepository.js';
import { getWatermarkSettings } from '../db/repositories/watermarkSettingsRepository.js';
import { applyWatermark } from './watermark/imageEngine.js';
import { shopify } from '../config/shopify-app.js';
import {
    GET_PRODUCT_MEDIA,
    PRODUCT_CREATE_MEDIA,
    PRODUCT_REORDER_MEDIA,
    STAGED_UPLOADS_CREATE
} from '../graphql/watermark-queries.js';
import { getShopToken } from '../db/repositories/shopRepository.js';
import axios from 'axios';

/**
 * Watermark Apply Worker
 */
export const watermarkWorker = new Worker(
    QUEUE_NAMES.WATERMARK_APPLY,
    async (job) => {
        const { jobId, shop, scopeType, scopeValue } = job.data;

        console.log(`[Worker] Starting job ${jobId} for ${shop} (Scope: ${scopeType})`);

        // 1. Mark job as processing
        await startJob(jobId);

        try {
            const accessToken = await getShopToken(shop);
            const settings = await getWatermarkSettings(shop);

            // 2. Resolve products based on scope
            const productIds = await resolveProductIds(shop, accessToken, scopeType, scopeValue);
            console.log(`[Worker] Resolved ${productIds.length} products to process`);

            // 3. Process each product
            for (const productId of productIds) {
                try {
                    await processProduct(shop, accessToken, productId, jobId, settings);
                    await incrementProcessedProducts(jobId);
                } catch (error) {
                    console.error(`[Worker] Failed to process product ${productId}:`, error.message);
                    await incrementFailedProducts(jobId);
                }
            }

            // 4. Mark job as completed
            await completeJob(jobId, JOB_STATUS.COMPLETED);

        } catch (error) {
            console.error(`[Worker] Fatal error in job ${jobId}:`, error.message);
            await completeJob(jobId, JOB_STATUS.FAILED);
            throw error;
        }
    },
    {
        connection: redisConnection,
        concurrency: 1 // Keep it 1 for MVP to avoid rate limits
    }
);

/**
 * Resolve product IDs based on job scope
 */
async function resolveProductIds(shop, accessToken, scopeType, scopeValue) {
    const client = new shopify.api.clients.Graphql({
        session: { shop, accessToken }
    });

    let productIds = [];

    if (scopeType === SCOPE_TYPE.MANUAL) {
        return Array.isArray(scopeValue) ? scopeValue : [scopeValue];
    }

    try {
        let hasNextPage = true;
        let cursor = null;

        while (hasNextPage) {
            const query = scopeType === SCOPE_TYPE.COLLECTION ? GET_PRODUCTS_BY_COLLECTION : GET_ALL_PRODUCTS;
            const variables = scopeType === SCOPE_TYPE.COLLECTION
                ? { collectionId: scopeValue, cursor }
                : { cursor };

            const res = await client.request(query, { variables });

            const connection = scopeType === SCOPE_TYPE.COLLECTION
                ? res.data.collection.products
                : res.data.products;

            const ids = connection.edges.map(edge => edge.node.id);
            productIds = [...productIds, ...ids];

            hasNextPage = connection.pageInfo.hasNextPage;
            cursor = connection.pageInfo.endCursor;

            // Safety break to prevent infinite loops in large stores for MVP
            if (productIds.length > 5000) break;
        }
    } catch (error) {
        console.error(`[Worker] Error resolving products for ${shop}:`, error.message);
        throw error;
    }

    return productIds;
}

/**
 * Process a single product: Download -> Watermark -> Upload -> Swap
 */
async function processProduct(shop, accessToken, productId, jobId, settings) {
    const client = new shopify.api.clients.Graphql({
        session: { shop, accessToken }
    });

    // A. Fetch current media
    const mediaRes = await client.request(GET_PRODUCT_MEDIA, { variables: { id: productId } });
    const mediaNodes = mediaRes.data.product.media.edges.map(e => e.node);
    const targetImage = mediaNodes.find(m => m.mediaContentType === 'IMAGE'); // Process first image for now

    if (!targetImage) {
        console.log(`[Worker] No images found for product ${productId}, skipping.`);
        return;
    }

    const originalUrl = targetImage.image.url;
    const originalMediaId = targetImage.id;

    // B. Apply watermark
    const { buffer, hash } = await applyWatermark(originalUrl, settings);

    // C. Record in DB (Job Item)
    const jobItem = await createJobItem(
        jobId,
        productId,
        mediaRes.data.product.title,
        originalMediaId,
        originalUrl,
        1, // Position placeholder
        true, // Is featured placeholder
        hash
    );

    try {
        // D. Upload to Shopify (Staged Uploads)
        const fileName = `watermarked_${Date.now()}.jpg`;
        const stagedUploadRes = await client.request(STAGED_UPLOADS_CREATE, {
            variables: {
                input: [{
                    filename: fileName,
                    mimeType: 'image/jpeg',
                    resource: 'IMAGE',
                    httpMethod: 'POST'
                }]
            }
        });

        const target = stagedUploadRes.data.stagedUploadsCreate.stagedTargets[0];

        // Multipart upload
        const formData = new FormData();
        target.parameters.forEach(p => formData.append(p.name, p.value));
        formData.append('file', new Blob([buffer]));

        await axios.post(target.url, formData);

        // E. Create Media on Product
        const createRes = await client.request(PRODUCT_CREATE_MEDIA, {
            variables: {
                productId,
                media: [{
                    originalSource: target.resourceUrl,
                    mediaContentType: 'IMAGE',
                    alt: `Watermarked ${mediaRes.data.product.title}`
                }]
            }
        });

        if (createRes.data.productCreateMedia.mediaUserErrors.length > 0) {
            throw new Error(createRes.data.productCreateMedia.mediaUserErrors[0].message);
        }

        const newMediaId = createRes.data.productCreateMedia.media[0].id;

        // F. Reorder/Swap: Make the new watermarked image the FIRST one (Featured)
        // This ensures the customer sees the watermarked version immediately
        try {
            await client.request(PRODUCT_REORDER_MEDIA, {
                variables: {
                    id: productId,
                    moves: [{
                        id: newMediaId,
                        newPosition: "0" // Move to first position
                    }]
                }
            });
            console.log(`[Worker] Reordered media for ${productId}: New image is now featured.`);
        } catch (reorderError) {
            console.warn(`[Worker] Non-fatal: Failed to reorder media for ${productId}:`, reorderError.message);
        }

        // G. Mark DB item as completed
        await markJobItemCompleted(jobItem.id, newMediaId, target.resourceUrl);

        console.log(`[Worker] Successfully processed product ${productId}`);

    } catch (error) {
        await markJobItemFailed(jobItem.id, error.message);
        throw error;
    }
}
