import { Worker } from 'bullmq';
import { redisConnection } from '../config/redis.js';
import { QUEUE_NAMES, JOB_STATUS, JOB_ITEM_STATUS, SCOPE_TYPE } from '../constants/watermark.js';
import { startJob, completeJob, incrementProcessedProducts, incrementFailedProducts, getWatermarkJob, setTotalProducts } from '../db/repositories/watermarkJobsRepository.js';
import { createJobItem, markJobItemCompleted, markJobItemFailed } from '../db/repositories/watermarkJobItemsRepository.js';
import { getWatermarkSettings } from '../db/repositories/watermarkSettingsRepository.js';
import { WatermarkProcessor } from './watermark/watermarkProcessor.js';
import { uploadToShopify } from './watermark/shopifyUpload.js';
import { shopify } from '../config/shopify-app.js';
import {
    GET_PRODUCT_MEDIA,
    GET_ALL_PRODUCTS,
    GET_PRODUCTS_BY_COLLECTION,
    PRODUCT_CREATE_MEDIA,
    PRODUCT_REORDER_MEDIA,
    PRODUCT_DELETE_MEDIA,
    PRODUCT_VARIANTS_BULK_UPDATE,
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
            console.log(`[Worker] Processing ${productIds.length} products with concurrency 3`);

            const processor = new WatermarkProcessor(settings);
            await processor.init();

            // Process products with controlled concurrency
            const CONCURRENCY = 3;
            for (let i = 0; i < productIds.length; i += CONCURRENCY) {
                const chunk = productIds.slice(i, i + CONCURRENCY);
                await Promise.all(chunk.map(async (productId) => {
                    try {
                        await processProduct(shop, accessToken, productId, jobId, processor);
                        await incrementProcessedProducts(jobId);
                    } catch (error) {
                        console.error(`[Worker] Product ${productId} failed:`, error.message);
                        await incrementFailedProducts(jobId);
                    }
                }));

                // Periodically trigger GC if available
                if (i % 6 === 0 && global.gc) global.gc();
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

async function processProduct(shop, accessToken, productId, jobId, processor) {
    const apiStart = Date.now();
    // A. Fetch current media
    const mediaRes = await graphqlRequest(shop, accessToken, GET_PRODUCT_MEDIA, { id: productId });
    const productNode = mediaRes.product;
    const productName = productNode.title;
    const mediaNodes = productNode.media.edges
        .map(e => e.node)
        .filter(m => m.mediaContentType === 'IMAGE');

    const variants = productNode.variants.edges.map(e => e.node);
    if (mediaNodes.length === 0) return;

    // B. Batch Staged Upload URLs
    const processedItems = [];
    const MAX_STAGED_BATCH = 25;
    const stagedTargets = [];

    for (let i = 0; i < mediaNodes.length; i += MAX_STAGED_BATCH) {
        const batch = mediaNodes.slice(i, i + MAX_STAGED_BATCH);
        const stagedInputs = batch.map((_, idx) => ({
            filename: `wm_${Date.now()}_${productId.split('/').pop()}_${i + idx}.jpg`,
            mimeType: 'image/jpeg',
            resource: 'IMAGE',
            httpMethod: 'POST'
        }));

        const stagedRes = await graphqlRequest(shop, accessToken, STAGED_UPLOADS_CREATE, { input: stagedInputs });
        stagedTargets.push(...stagedRes.stagedUploadsCreate.stagedTargets);
    }

    // C. Process images with streams and timers
    for (let i = 0; i < mediaNodes.length; i++) {
        const targetImage = mediaNodes[i];
        const target = stagedTargets[i];
        if (!target) continue;

        try {
            // High-Res Timber starts inside processor.process
            const { stream, metadata, timings } = await processor.process(targetImage.image.url);

            // Upload Stream
            const uploadRes = await uploadToShopify(target, stream, 'image/jpeg', `wm_${i}.jpg`);

            timings.upload_ms = uploadRes.upload_ms;
            const totalEnd = process.hrtime(timings.total_start);
            timings.total_ms = (totalEnd[0] * 1000 + totalEnd[1] / 1000000).toFixed(2);

            console.log(`[Worker] Image Processed: ${productName} | Size: ${metadata.input_size}b -> ? | Timings: DL:${timings.download_ms}ms, SH:${timings.sharp_ms}ms, UP:${timings.upload_ms}ms, Total:${timings.total_ms}ms`);

            processedItems.push({
                originalMediaId: targetImage.id,
                originalUrl: targetImage.image.url,
                resourceUrl: target.resourceUrl,
                index: i,
                variantIds: variants.filter(v => v.image?.id === targetImage.image?.id).map(v => v.id)
            });
        } catch (err) {
            console.error(`[Worker] Image ${i} in ${productId} failed:`, err.message);
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

        if (createRes.productCreateMedia?.mediaUserErrors?.length > 0) {
            console.error(`[Worker] Shopify MediaCreate Error for ${productId}:`, JSON.stringify(createRes.productCreateMedia.mediaUserErrors));
        }

        if (createRes.productCreateMedia?.media) {
            newMediaNodes.push(...createRes.productCreateMedia.media);
            console.log(`[Worker] Successfully created ${createRes.productCreateMedia.media.length} media items on Shopify for ${productId}`);
        }
    }

    // F. Save to DB and Reorder
    const moves = [];
    const variantUpdates = [];

    for (let i = 0; i < processedItems.length; i++) {
        const item = processedItems[i];
        const newMediaId = newMediaNodes[i]?.id;
        if (!newMediaId) continue;

        // Prepare variant updates
        if (item.variantIds?.length > 0) {
            item.variantIds.forEach(vId => {
                variantUpdates.push({ id: vId, mediaId: newMediaId });
            });
        }

        const jobItem = await createJobItem(
            jobId, productId, productName, item.originalMediaId,
            item.originalUrl, item.index + 1, item.index === 0, item.hash,
            item.variantIds
        );
        await markJobItemCompleted(jobItem.id, newMediaId, item.resourceUrl);
        moves.push({ id: newMediaId, newPosition: i.toString() });
    }

    // G. Assign new media to variants if needed
    if (variantUpdates.length > 0) {
        try {
            await graphqlRequest(shop, accessToken, PRODUCT_VARIANTS_BULK_UPDATE, {
                productId,
                variants: variantUpdates
            });
        } catch (variantErr) {
            console.warn(`[Worker] Variant update fail for ${productId}:`, variantErr.message);
        }
    }

    // H. Reorder (Also in chunks if there are many moves, but 250 is usually safe for reorder)
    if (moves.length > 0) {
        await graphqlRequest(shop, accessToken, PRODUCT_REORDER_MEDIA, { id: productId, moves }).catch(e => {
            console.warn(`[Worker] Reorder fail for ${productId}:`, e.message);
        });
    }

    // I. DELETE ORIGINAL MEDIA (As requested by user: "koparsak")
    const originalMediaIds = processedItems.map(item => item.originalMediaId).filter(id => id);
    if (originalMediaIds.length > 0) {
        try {
            await graphqlRequest(shop, accessToken, PRODUCT_DELETE_MEDIA, {
                productId,
                mediaIds: originalMediaIds
            });
            console.log(`[Worker] Deleted ${originalMediaIds.length} original images for ${productId}`);
        } catch (delErr) {
            console.warn(`[Worker] Cleanup fail for ${productId}:`, delErr.message);
        }
    }
}
