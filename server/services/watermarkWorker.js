import { Worker } from 'bullmq';
import { redisConnection } from '../config/redis.js';
import { QUEUE_NAMES, JOB_STATUS, JOB_ITEM_STATUS, SCOPE_TYPE } from '../constants/watermark.js';
import { startJob, completeJob, incrementProcessedProducts, incrementFailedProducts, getWatermarkJob, setTotalProducts } from '../db/repositories/watermarkJobsRepository.js';
import { createJobItem, markJobItemCompleted, markJobItemFailed } from '../db/repositories/watermarkJobItemsRepository.js';
import { getWatermarkSettings } from '../db/repositories/watermarkSettingsRepository.js';
import { applyWatermark, downloadImage } from './watermark/imageEngine.js';
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
import { graphqlRequest } from '../utils/shopify-client.js';
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
            const jobRecord = await getWatermarkJob(jobId);
            if (!jobRecord) throw new Error(`Job ${jobId} not found`);

            const { scope_type, scope_value, settings_snapshot } = jobRecord;
            const accessToken = await getShopToken(shop);
            const settings = settings_snapshot || await getWatermarkSettings(shop);

            await startJob(jobId);
            const productIds = await resolveProductIds(shop, accessToken, scope_type, scope_value);

            // 📊 Update total products count once we know it
            await setTotalProducts(jobId, productIds.length);

            console.log(`[Worker] Processing ${productIds.length} products`);

            for (const productId of productIds) {
                try {
                    // Process one product at a time for better stability and progress tracking
                    await processProduct(shop, accessToken, productId, jobId, settings);
                    await incrementProcessedProducts(jobId);
                } catch (error) {
                    console.error(`[Worker] Product ${productId} failed:`, error.message);
                    await incrementFailedProducts(jobId);
                }
            }

            await completeJob(jobId, JOB_STATUS.COMPLETED);
        } catch (error) {
            console.error(`[Worker] Fatal job error:`, error.message);
            await completeJob(jobId, JOB_STATUS.FAILED);
            throw error;
        }
    },
    {
        connection: redisConnection,
        concurrency: 1 // Back to 1 for stability while debugging "stuck" issue
    }
);

async function resolveProductIds(shop, accessToken, scopeType, scopeValue) {
    const client = new shopify.api.clients.Graphql({ session: { shop, accessToken } });
    let productIds = [];
    if (scopeType === SCOPE_TYPE.MANUAL) return Array.isArray(scopeValue) ? scopeValue : [scopeValue];

    try {
        let hasNextPage = true, cursor = null;
        while (hasNextPage) {
            const query = scopeType === SCOPE_TYPE.COLLECTION ? GET_PRODUCTS_BY_COLLECTION : GET_ALL_PRODUCTS;
            const res = await client.request(query, { variables: { collectionId: scopeValue, cursor } });
            const connection = scopeType === SCOPE_TYPE.COLLECTION ? res.data.collection.products : res.data.products;
            productIds.push(...connection.edges.map(e => e.node.id));
            hasNextPage = connection.pageInfo.hasNextPage;
            cursor = connection.pageInfo.endCursor;
            if (productIds.length > 5000) break;
        }
    } catch (error) {
        console.error(`[Worker] Error resolving products:`, error.message);
        throw error;
    }
    return productIds;
}

async function processProduct(shop, accessToken, productId, jobId, settings) {
    // A. Fetch current media
    const mediaRes = await graphqlRequest(shop, accessToken, GET_PRODUCT_MEDIA, { id: productId });
    const productNode = mediaRes.product;
    const productName = productNode.title;
    const mediaNodes = productNode.media.edges
        .map(e => e.node)
        .filter(m => m.mediaContentType === 'IMAGE');

    if (mediaNodes.length === 0) return;

    // B. Pre-download logo once
    let preloadedLogoBuffer = null;
    if (settings.logo_url) {
        preloadedLogoBuffer = await downloadImage(settings.logo_url).catch(e => {
            console.warn(`[Worker] Logo download failed: ${e.message}`);
            return null;
        });
    }

    // C. Batch Staged Upload URLs (Shopify allows multiple in one call)
    // This significantly reduces RTT for products with many images
    const processedItems = [];
    const MAX_STAGED_BATCH = 25;
    const stagedTargets = [];

    for (let i = 0; i < mediaNodes.length; i += MAX_STAGED_BATCH) {
        const batch = mediaNodes.slice(i, i + MAX_STAGED_BATCH);
        const stagedInputs = batch.map((_, idx) => ({
            filename: `wm_${Date.now()}_${i + idx}.jpg`,
            mimeType: 'image/jpeg',
            resource: 'IMAGE',
            httpMethod: 'POST'
        }));

        const stagedRes = await graphqlRequest(shop, accessToken, STAGED_UPLOADS_CREATE, { input: stagedInputs });
        stagedTargets.push(...stagedRes.stagedUploadsCreate.stagedTargets);
    }

    // D. Process images SEQUENTIALLY for ultra-low memory usage (500MB limit safety)
    const IMAGE_CONCURRENCY = 1;
    for (let i = 0; i < mediaNodes.length; i += IMAGE_CONCURRENCY) {
        const batch = mediaNodes.slice(i, i + IMAGE_CONCURRENCY);

        await Promise.all(batch.map(async (targetImage, batchIdx) => {
            const index = i + batchIdx;
            const target = stagedTargets[index];
            if (!target) return;

            let imageBuffer = null;
            try {
                const result = await applyWatermark(targetImage.image.url, settings, preloadedLogoBuffer);
                imageBuffer = result.buffer;
                const imageHash = result.hash;

                // Upload directly to Shopify's bucket
                const formData = new FormData();
                target.parameters.forEach(p => formData.append(p.name, p.value));
                formData.append('file', new Blob([imageBuffer], { type: 'image/jpeg' }), target.parameters.find(p => p.name === 'key')?.value || 'file.jpg');

                await axios.post(target.url, formData, { timeout: 60000 });

                processedItems.push({
                    originalMediaId: targetImage.id,
                    originalUrl: targetImage.image.url,
                    resourceUrl: target.resourceUrl,
                    hash: imageHash,
                    index
                });

                // 🗑️ Explicitly cleanup large buffer
                imageBuffer = null;
            } catch (err) {
                console.error(`[Worker] Image ${index} in ${productId} failed:`, err.message);
            } finally {
                imageBuffer = null;
            }
        }));

        // Manual cleanup hint for GC every 2 images
        if (i % 2 === 0 && global.gc) {
            global.gc();
        }
    }

    if (processedItems.length === 0) return;

    // E. Create Media on Product in chunks of 10 (Shopify Limit)
    // This fixes the "only 10 images" issue
    const newMediaNodes = [];
    const MEDIA_CREATE_CHUNK = 10;

    // Sort processed items by index to maintain order
    processedItems.sort((a, b) => a.index - b.index);

    for (let i = 0; i < processedItems.length; i += MEDIA_CREATE_CHUNK) {
        const chunk = processedItems.slice(i, i + MEDIA_CREATE_CHUNK);
        const createRes = await graphqlRequest(shop, accessToken, PRODUCT_CREATE_MEDIA, {
            productId,
            media: chunk.map(item => ({
                originalSource: item.resourceUrl,
                mediaContentType: 'IMAGE',
                alt: `Watermarked ${productName}`
            }))
        });

        if (createRes.productCreateMedia?.media) {
            newMediaNodes.push(...createRes.productCreateMedia.media);
        }
    }

    // F. Save to DB and Reorder
    const moves = [];
    for (let i = 0; i < processedItems.length; i++) {
        const item = processedItems[i];
        const newMediaId = newMediaNodes[i]?.id;
        if (!newMediaId) continue;

        const jobItem = await createJobItem(
            jobId, productId, productName, item.originalMediaId,
            item.originalUrl, item.index + 1, item.index === 0, item.hash
        );
        await markJobItemCompleted(jobItem.id, newMediaId, item.resourceUrl);
        moves.push({ id: newMediaId, newPosition: i.toString() });
    }

    // G. Reorder (Also in chunks if there are many moves, but 250 is usually safe for reorder)
    if (moves.length > 0) {
        await graphqlRequest(shop, accessToken, PRODUCT_REORDER_MEDIA, { id: productId, moves }).catch(e => {
            console.warn(`[Worker] Reorder fail for ${productId}:`, e.message);
        });
    }
}
