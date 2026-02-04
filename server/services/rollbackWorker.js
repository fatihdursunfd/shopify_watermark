import { Worker } from 'bullmq';
import { redisConnection } from '../config/redis.js';
import pool from '../db/index.js';
import { QUEUE_NAMES, JOB_STATUS, JOB_TYPE, ROLLBACK_STATUS } from '../constants/watermark.js';
import {
    createWatermarkJob,
    updateJobStatus,
    completeJob,
    incrementProcessedProducts,
    setTotalProducts
} from '../db/repositories/watermarkJobsRepository.js';
import {
    getJobItemsForRollback,
    markJobItemRolledBack
} from '../db/repositories/watermarkJobItemsRepository.js';
import {
    createRollbackRun,
    startRollbackRun,
    completeRollbackRun,
    incrementRolledBackItems
} from '../db/repositories/rollbackRunsRepository.js';
import { shopify } from '../config/shopify-app.js';
import {
    PRODUCT_DELETE_MEDIA
} from '../graphql/watermark-queries.js';
import {
    getProductMedia,
    resolveFileIdFromMaybeMediaId,
    attachFileToProduct,
    detachFileFromProduct,
    reorderProductMedia,
    safeDeleteMedia
} from './mediaService.js';
import { graphqlRequest } from '../utils/shopify-client.js';
import { getShopToken } from '../db/repositories/shopRepository.js';

/**
 * Watermark Rollback Worker
 */
export const rollbackWorker = new Worker(
    QUEUE_NAMES.WATERMARK_ROLLBACK,
    async (job) => {
        const { jobId: originalJobId, shop } = job.data;

        console.log(`[RollbackWorker] Starting rollback for job ${originalJobId} in ${shop}`);

        try {
            const accessToken = await getShopToken(shop);

            // 1. Get all items that were successfully watermarked
            const items = await getJobItemsForRollback(originalJobId);
            console.log(`[RollbackWorker] Found ${items.length} items to rollback`);

            if (items.length === 0) {
                console.log('[RollbackWorker] Nothing to rollback.');
                return;
            }

            // 2. Create a rollback tracking record
            const rollbackRun = await createRollbackRun(originalJobId, shop, items.length);
            await startRollbackRun(rollbackRun.id);

            // Setup main job progress for rollback tracking
            await setTotalProducts(originalJobId, items.length);
            await updateJobStatus(originalJobId, JOB_STATUS.PROCESSING);
            await pool.query('UPDATE watermark_jobs SET processed_products = 0 WHERE id = $1', [originalJobId]);

            // 3. Process each item (Reference-Based Rollback)
            for (const item of items) {
                try {
                    let isRestored = false;
                    const logPrefix = `[Rollback: ${item.product_id}]`;

                    console.log(`${logPrefix} Processing item...`);

                    // A. Resolve Original File ID
                    const originalFileId = await resolveFileIdFromMaybeMediaId(shop, accessToken, item.original_media_id);

                    if (!originalFileId) {
                        console.error(`${logPrefix} Could not resolve File ID from ${item.original_media_id}. Skipping.`);
                        continue;
                    }

                    // B. Re-Attach Original File (Add Reference)
                    try {
                        await attachFileToProduct(shop, accessToken, originalFileId, item.product_id);
                        console.log(`${logPrefix} Re-attached original file ${originalFileId}`);

                        // C. 🛡️ VERIFY & FIND MEDIA ID (Fail-Safe)
                        const currentMedia = await getProductMedia(shop, accessToken, item.product_id);

                        // matchingMedia: The media item in the product that points to our Original File ID
                        const matchingMedia = currentMedia.find(m => m.fileId === originalFileId);

                        if (matchingMedia) {
                            console.log(`${logPrefix} Verified original is present (Media ID: ${matchingMedia.id})`);

                            // D. Reorder to Position 0
                            await reorderProductMedia(shop, accessToken, item.product_id, [{
                                id: matchingMedia.id,
                                newPosition: "0"
                            }]);
                            console.log(`${logPrefix} Reordered to position 0`);

                            isRestored = true;
                        } else {
                            console.error(`${logPrefix} CRITICAL: Attached file but could not find it in product media list! Skipping watermark detach.`);
                        }

                    } catch (attachErr) {
                        // Check if it failed because it's already attached? 
                        console.warn(`${logPrefix} Attach failed: ${attachErr.message}. Checking if already present...`);

                        const currentMedia = await getProductMedia(shop, accessToken, item.product_id);
                        const matchingMedia = currentMedia.find(m => m.fileId === originalFileId);
                        if (matchingMedia) {
                            console.log(`${logPrefix} Original was already there.`);
                            isRestored = true;
                            try { await reorderProductMedia(shop, accessToken, item.product_id, [{ id: matchingMedia.id, newPosition: "0" }]); } catch (e) { }
                        }
                    }

                    // E. Detach Watermarked Media (Only if verified restored)
                    if (isRestored && item.new_media_id) {
                        const watermarkedFileId = await resolveFileIdFromMaybeMediaId(shop, accessToken, item.new_media_id);

                        if (watermarkedFileId) {
                            try {
                                await detachFileFromProduct(shop, accessToken, watermarkedFileId, item.product_id);
                                console.log(`${logPrefix} Detached watermarked file ${watermarkedFileId}`);
                            } catch (detachErr) {
                                console.warn(`${logPrefix} Failed to detach watermark:`, detachErr.message);
                            }
                        } else {
                            // Fallback: Delete Media if File ID resolution fails (e.g. strict MediaImage)
                            try {
                                await safeDeleteMedia(shop, accessToken, item.product_id, item.new_media_id);
                                console.log(`${logPrefix} Deleted watermarked media (Fallback delete)`);
                            } catch (delErr) {
                                console.warn(`${logPrefix} Fallback delete failed:`, delErr.message);
                            }
                        }

                        // F. Mark Complete
                        await markJobItemRolledBack(item.id);
                        await incrementRolledBackItems(rollbackRun.id);
                        await incrementProcessedProducts(originalJobId);
                    }

                } catch (itemError) {
                    console.error(`${logPrefix} Failed to rollback:`, itemError.message);
                }
            }

            // 4. Update Original Job Status
            await updateJobStatus(originalJobId, JOB_STATUS.ROLLED_BACK);
            await completeRollbackRun(rollbackRun.id, ROLLBACK_STATUS.COMPLETED);

            console.log(`[RollbackWorker] Rollback completed for job ${originalJobId}`);

        } catch (error) {
            console.error(`[RollbackWorker] Fatal error in rollback ${originalJobId}:`, error.message);
            throw error;
        }
    },
    { connection: redisConnection }
);


