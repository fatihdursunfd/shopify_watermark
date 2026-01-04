import { Worker } from 'bullmq';
import { redisConnection } from '../config/redis.js';
import { QUEUE_NAMES, JOB_STATUS, JOB_ITEM_STATUS, SCOPE_TYPE } from '../constants/watermark.js';
import { startJob, completeJob, incrementProcessedProducts, incrementFailedProducts, getWatermarkJob } from '../db/repositories/watermarkJobsRepository.js';
import { createJobItem, markJobItemCompleted, markJobItemFailed } from '../db/repositories/watermarkJobItemsRepository.js';
import { getWatermarkSettings } from '../db/repositories/watermarkSettingsRepository.js';
import { applyWatermark } from './watermark/imageEngine.js';
import { shopify } from '../config/shopify-app.js';
import {
    GET_PRODUCT_MEDIA,
    GET_ALL_PRODUCTS,
    GET_PRODUCTS_BY_COLLECTION,
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
        const { jobId, shop } = job.data;

        console.log(`[Worker] Starting job ${jobId} for ${shop}`);

        try {
            // 0. Fetch job to get snapshot and other details
            const jobRecord = await getWatermarkJob(jobId);
            if (!jobRecord) {
                throw new Error(`Job ${jobId} not found in database`);
            }

            const { scope_type, scope_value, settings_snapshot } = jobRecord;
            const accessToken = await getShopToken(shop);

            // Use snapshot from job or fallback to current settings
            const settings = settings_snapshot || await getWatermarkSettings(shop);

            // 1. Mark job as processing
            await startJob(jobId);

            // 2. Resolve products based on scope
            const productIds = await resolveProductIds(shop, accessToken, scope_type, scope_value);
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
        concurrency: 3 // Increased concurrency to process multiple products simultaneously
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
    const productName = mediaRes.data.product.title;
    const mediaNodes = mediaRes.data.product.media.edges
        .map(e => e.node)
        .filter(m => m.mediaContentType === 'IMAGE');

    if (mediaNodes.length === 0) {
        console.log(`[Worker] No images found for product ${productId}, skipping.`);
        return;
    }

    console.log(`[Worker] Found ${mediaNodes.length} images for product ${productId}. Processing in parallel...`);

    // B. Pre-download logo once for this product
    let preloadedLogoBuffer = null;
    if (settings.logo_url) {
        try {
            const { downloadImage } = await import('./watermark/imageEngine.js');
            preloadedLogoBuffer = await downloadImage(settings.logo_url);
        } catch (logoError) {
            console.error('[Worker] Failed to pre-download logo:', logoError.message);
        }
    }

    // C. Process each image in PARALLEL
    const processingPromises = mediaNodes.map(async (targetImage, i) => {
        const originalUrl = targetImage.image.url;
        const originalMediaId = targetImage.id;

        try {
            // 1. Apply watermark (with preloaded logo)
            const { buffer, hash } = await applyWatermark(originalUrl, settings, preloadedLogoBuffer);

            // 2. Upload to Shopify (Staged Uploads)
            const fileName = `watermarked_${Date.now()}_${i}.jpg`;
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

            const stagedData = stagedUploadRes.data.stagedUploadsCreate;
            if (stagedData.userErrors.length > 0) throw new Error(stagedData.userErrors[0].message);

            const target = stagedData.stagedTargets[0];
            const formData = new FormData();
            target.parameters.forEach(p => formData.append(p.name, p.value));
            const fileBlob = new Blob([buffer], { type: 'image/jpeg' });
            formData.append('file', fileBlob, fileName);

            await axios.post(target.url, formData);

            return {
                originalMediaId,
                originalUrl,
                resourceUrl: target.resourceUrl,
                hash,
                index: i
            };
        } catch (error) {
            console.error(`[Worker] Image ${i} failed for product ${productId}:`, error.message);
            return null;
        }
    });

    const results = await Promise.all(processingPromises);
    const processedItems = results.filter(item => item !== null);

    if (processedItems.length === 0) {
        throw new Error(`Failed to watermark any images for product ${productId}`);
    }

    // D. Create Media on Product in Bulk
    const mediaInput = processedItems.map(item => ({
        originalSource: item.resourceUrl,
        mediaContentType: 'IMAGE',
        alt: `Watermarked ${productName}`
    }));

    const createRes = await client.request(PRODUCT_CREATE_MEDIA, {
        variables: { productId, media: mediaInput }
    });

    if (createRes.data.productCreateMedia.mediaUserErrors.length > 0) {
        throw new Error(createRes.data.productCreateMedia.mediaUserErrors[0].message);
    }

    const newMediaNodes = createRes.data.productCreateMedia.media;

    // E. Record in DB and Reorder
    const moves = [];
    for (let i = 0; i < processedItems.length; i++) {
        const item = processedItems[i];
        const newMediaId = newMediaNodes[i].id;

        const jobItem = await createJobItem(
            jobId, productId, productName, item.originalMediaId,
            item.originalUrl, item.index + 1, item.index === 0, item.hash
        );

        await markJobItemCompleted(jobItem.id, newMediaId, item.resourceUrl);

        moves.push({ id: newMediaId, newPosition: i.toString() });
    }

    // F. Reorder/Swap
    try {
        await client.request(PRODUCT_REORDER_MEDIA, { variables: { id: productId, moves } });
    } catch (reorderError) {
        console.warn(`[Worker] Reorder non-fatal error for ${productId}:`, reorderError.message);
    }

    console.log(`[Worker] Successfully processed product ${productId}`);
}
