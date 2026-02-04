import { Worker } from 'bullmq';
import { redisConnection } from '../config/redis.js';
import pool from '../db/index.js';
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
    PRODUCT_VARIANTS_BULK_UPDATE,
    STAGED_UPLOADS_CREATE,
    FILE_CREATE
} from '../graphql/watermark-queries.js';
import { resolveFileIdFromMaybeMediaId, detachFileFromProduct } from './mediaService.js';
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

            // --- ARCHIVE & DUPLICATE CHECK ("mağaza medyasında kalmalı") ---
            let archivedSource = targetImage.image.url;
            const isAlreadyFile = archivedSource.includes('/files/');

            if (!isAlreadyFile) {
                // Check if we already archived this SPECIFIC media ID in a previous job
                try {
                    const { rows } = await pool.query(`
                        SELECT i.original_media_url
                        FROM watermark_job_items i
                        JOIN watermark_jobs j ON i.job_id = j.id
                        WHERE j.shop = $1 AND i.original_media_id = $2
                          AND (i.original_media_url LIKE '%/files/%' OR i.original_media_url LIKE 'gid://shopify/%')
                          AND i.status = 'completed'
                        LIMIT 1
                    `, [shop, targetImage.id]);

                    if (rows.length > 0) {
                        archivedSource = rows[0].original_media_url;
                        console.log(`[Worker] Found existing archive for ${targetImage.id}: ${archivedSource}`);
                    } else {
                        // Truly new, archive it to Shopify Files
                        console.log(`[Worker] Archiving original image for ${productId}...`);
                        const archiveRes = await graphqlRequest(shop, accessToken, FILE_CREATE, {
                            files: [{
                                originalSource: targetImage.image.url.split('?')[0],
                                contentType: 'IMAGE',
                                alt: `Original Backup: ${productName}`
                            }]
                        });

                        // Log archive errors
                        const errors = archiveRes.fileCreate?.userErrors || [];
                        if (errors.length > 0) {
                            console.error(`[Worker] Archive Error for ${productId}:`, JSON.stringify(errors));
                        }

                        // Store the File ID (GID) as it's the most robust source for restoration
                        const archivedFile = archiveRes.fileCreate?.files?.[0];
                        archivedSource = archivedFile?.id || archivedFile?.image?.url || targetImage.image.url;
                        console.log(`[Worker] Archived ${targetImage.id} to permanent source: ${archivedSource}`);
                    }
                } catch (dbErr) {
                    console.warn(`[Worker] Archive lookup failed, defaulting to CDN:`, dbErr.message);
                }
            }

            // Upload Watermarked Stream
            const uploadRes = await uploadToShopify(target, stream, 'image/jpeg', `wm_${i}.jpg`);

            timings.upload_ms = uploadRes.upload_ms;
            const totalEnd = process.hrtime(timings.total_start);
            timings.total_ms = (totalEnd[0] * 1000 + totalEnd[1] / 1000000).toFixed(2);

            console.log(`[Worker] Image Processed: ${productName} | Size: ${metadata.input_size}b -> ? | Timings: DL:${timings.download_ms}ms, SH:${timings.sharp_ms}ms, UP:${timings.upload_ms}ms, Total:${timings.total_ms}ms`);

            processedItems.push({
                originalMediaId: targetImage.id,
                originalUrl: archivedSource, // GID or URL
                resourceUrl: target.resourceUrl,
                index: i,
                variantIds: variants.filter(v => v.image?.id === targetImage.image?.id).map(v => v.id)
            });
        } catch (err) {
            console.error(`[Worker] Image ${i} in ${productId} failed:`, err.message);
        }
    }

    if (processedItems.length === 0) return;

    // E & F. Create Media on Product and Save to DB
    const moves = [];
    const variantUpdates = [];
    // We do this sequentially per image within a product to ensure ID alignment is perfect.
    for (let i = 0; i < processedItems.length; i++) {
        const item = processedItems[i];

        try {
            const createRes = await graphqlRequest(shop, accessToken, PRODUCT_CREATE_MEDIA, {
                productId,
                media: [{
                    originalSource: item.resourceUrl,
                    mediaContentType: 'IMAGE',
                    alt: `Watermarked ${productName}`
                }]
            });

            const errors = createRes.productCreateMedia?.mediaUserErrors || [];
            if (errors.length > 0) {
                console.error(`[Worker] Shopify MediaCreate Error for ${productId} (Index ${item.index}):`, JSON.stringify(errors));
                continue;
            }

            const newMedia = createRes.productCreateMedia?.media?.[0];
            const newMediaId = newMedia?.id;

            if (!newMediaId) {
                console.error(`[Worker] Failed to get new media ID for ${productId} (Index ${item.index})`);
                continue;
            }

            console.log(`[Worker] Created new media ${newMediaId} for product ${productId}`);

            // Prepare variant updates
            if (item.variantIds?.length > 0) {
                item.variantIds.forEach(vId => {
                    variantUpdates.push({ id: vId, mediaId: newMediaId });
                });
            }

            // Save to Database
            const jobItem = await createJobItem(
                jobId, productId, productName, item.originalMediaId,
                item.originalUrl, item.index + 1, item.index === 0, 'STREAM_PROCESSED',
                item.variantIds
            );
            await markJobItemCompleted(jobItem.id, newMediaId, item.resourceUrl);

            // Add to move list for reordering
            moves.push({ id: newMediaId, newPosition: item.index.toString() });

        } catch (err) {
            console.error(`[Worker] Media creation/DB save failed for ${productId} (Index ${item.index}):`, err.message);
        }
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

    // I. DETACH ORIGINAL MEDIA (Do not delete, just remove reference)
    const originalMediaIds = processedItems.map(item => item.originalMediaId).filter(id => id);
    if (originalMediaIds.length > 0) {
        // We do this concurrently or sequentially? Sequentially is safer for rate limits.
        for (const originalId of originalMediaIds) {
            try {
                // Must ensure we have a File ID
                const fileId = await resolveFileIdFromMaybeMediaId(shop, accessToken, originalId);
                if (fileId) {
                    await detachFileFromProduct(shop, accessToken, fileId, productId);
                    console.log(`[Worker] Detached original media ${originalId} (File ${fileId}) from ${productId}`);
                }
            } catch (detachErr) {
                console.warn(`[Worker] Failed to detach original media ${originalId}:`, detachErr.message);
            }
        }
    }
}
