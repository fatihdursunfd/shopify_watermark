import { Worker } from 'bullmq';
import { redisConnection } from '../config/redis.js';
import { QUEUE_NAMES, JOB_STATUS, JOB_ITEM_STATUS, SCOPE_TYPE } from '../constants/watermark.js';
import { startJob, completeJob, incrementProcessedProducts, incrementFailedProducts, getWatermarkJob } from '../db/repositories/watermarkJobsRepository.js';
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
    const client = new shopify.api.clients.Graphql({ session: { shop, accessToken } });

    // A. Fetch current media
    const mediaRes = await client.request(GET_PRODUCT_MEDIA, { variables: { id: productId } });
    const productNode = mediaRes.data.product;
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

    // C. Process images (Parallel capped or sequential for stability)
    const processedItems = [];
    for (let i = 0; i < mediaNodes.length; i++) {
        const targetImage = mediaNodes[i];
        try {
            const { buffer, hash } = await applyWatermark(targetImage.image.url, settings, preloadedLogoBuffer);

            // Staged upload
            const fileName = `wm_${Date.now()}_${i}.jpg`;
            const stagedRes = await client.request(STAGED_UPLOADS_CREATE, {
                variables: { input: [{ filename: fileName, mimeType: 'image/jpeg', resource: 'IMAGE', httpMethod: 'POST' }] }
            });
            const target = stagedRes.data.stagedUploadsCreate.stagedTargets[0];

            const formData = new FormData();
            target.parameters.forEach(p => formData.append(p.name, p.value));
            formData.append('file', new Blob([buffer], { type: 'image/jpeg' }), fileName);
            await axios.post(target.url, formData, { timeout: 60000 });

            processedItems.push({
                originalMediaId: targetImage.id,
                originalUrl: targetImage.image.url,
                resourceUrl: target.resourceUrl,
                hash,
                index: i
            });
        } catch (err) {
            console.error(`[Worker] Image ${i} in ${productId} failed:`, err.message);
        }
    }

    if (processedItems.length === 0) return;

    // D. Create Media on Product
    const createRes = await client.request(PRODUCT_CREATE_MEDIA, {
        variables: {
            productId,
            media: processedItems.map(item => ({
                originalSource: item.resourceUrl,
                mediaContentType: 'IMAGE',
                alt: `Watermarked ${productName}`
            }))
        }
    });

    const newMediaNodes = createRes.data.productCreateMedia.media;

    // E. Save to DB and Reorder
    const moves = [];
    for (let i = 0; i < processedItems.length; i++) {
        const item = processedItems[i];
        // The index in newMediaNodes might mismatch if some failed during creation, 
        // but productCreateMedia returns them in order of input.
        const newMediaId = newMediaNodes[i]?.id;
        if (!newMediaId) continue;

        const jobItem = await createJobItem(
            jobId, productId, productName, item.originalMediaId,
            item.originalUrl, item.index + 1, item.index === 0, item.hash
        );
        await markJobItemCompleted(jobItem.id, newMediaId, item.resourceUrl);
        moves.push({ id: newMediaId, newPosition: i.toString() });
    }

    // F. Reorder
    if (moves.length > 0) {
        await client.request(PRODUCT_REORDER_MEDIA, { variables: { id: productId, moves } }).catch(e => {
            console.warn(`[Worker] Reorder fail for ${productId}:`, e.message);
        });
    }
}
