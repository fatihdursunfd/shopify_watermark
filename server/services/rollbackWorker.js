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
    PRODUCT_DELETE_MEDIA,
    PRODUCT_REORDER_MEDIA,
    PRODUCT_CREATE_MEDIA,
    PRODUCT_VARIANTS_BULK_UPDATE
} from '../graphql/watermark-queries.js';
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

            // 🌟 Important: Setup main job progress for rollback tracking
            // Reset processed to 0 and set total to current rollback count
            await setTotalProducts(originalJobId, items.length);
            await updateJobStatus(originalJobId, JOB_STATUS.PROCESSING);

            // Reset processed_products specifically for this run
            await pool.query('UPDATE watermark_jobs SET processed_products = 0 WHERE id = $1', [originalJobId]);

            // 3. Process each item (Undo changes)
            for (const item of items) {
                try {
                    let restoredMediaId = null;

                    // A. Restore original media if we have the URL
                    if (item.original_media_url) {
                        try {
                            const createRes = await graphqlRequest(shop, accessToken, PRODUCT_CREATE_MEDIA, {
                                productId: item.product_id,
                                media: [{
                                    originalSource: item.original_media_url,
                                    mediaContentType: 'IMAGE',
                                    alt: 'Restored original'
                                }]
                            });

                            if (createRes.productCreateMedia?.media?.length > 0) {
                                restoredMediaId = createRes.productCreateMedia.media[0].id;
                                console.log(`[RollbackWorker] Restored original image for product ${item.product_id}`);
                            } else {
                                const errors = createRes.productCreateMedia?.mediaUserErrors || [];
                                console.error(`[RollbackWorker] Failed to restore media for product ${item.product_id}: ${JSON.stringify(errors)}`);
                            }
                        } catch (createErr) {
                            console.warn(`[RollbackWorker] Failed to restore original media from URL (${item.original_media_url}):`, createErr.message);
                        }
                    }

                    // B. Update variants to use restored original ID
                    if (restoredMediaId) {
                        if (item.variant_ids && item.variant_ids.length > 0) {
                            try {
                                const variantUpdates = item.variant_ids.map(vId => ({
                                    id: vId,
                                    mediaId: restoredMediaId
                                }));

                                await graphqlRequest(shop, accessToken, PRODUCT_VARIANTS_BULK_UPDATE, {
                                    productId: item.product_id,
                                    variants: variantUpdates
                                });
                                console.log(`[RollbackWorker] Updated ${item.variant_ids.length} variants for product ${item.product_id}`);
                            } catch (varErr) {
                                console.warn(`[RollbackWorker] Failed to update variants during rollback:`, varErr.message);
                            }
                        }

                        // C. Delete the watermarked media from Shopify (ONLY IF RESTORED)
                        if (item.new_media_id) {
                            try {
                                const deleteRes = await graphqlRequest(shop, accessToken, PRODUCT_DELETE_MEDIA, {
                                    productId: item.product_id,
                                    mediaIds: [item.new_media_id]
                                });

                                if (deleteRes.productDeleteMedia.mediaUserErrors.length > 0) {
                                    console.warn(`[RollbackWorker] Error deleting media ${item.new_media_id}:`, deleteRes.productDeleteMedia.mediaUserErrors[0].message);
                                } else {
                                    console.log(`[RollbackWorker] Deleted watermarked image ${item.new_media_id}`);
                                }
                            } catch (delErr) {
                                console.warn(`[RollbackWorker] Failed to delete watermarked media:`, delErr.message);
                            }
                        }

                        // D. Restore original featured status if it was featured
                        if (item.original_position === 1) {
                            try {
                                await graphqlRequest(shop, accessToken, PRODUCT_REORDER_MEDIA, {
                                    id: item.product_id,
                                    moves: [{
                                        id: restoredMediaId,
                                        newPosition: "0" // Restore to featured position
                                    }]
                                });
                            } catch (reorderError) {
                                console.warn(`[RollbackWorker] Reorder fail (non-fatal) for ${item.product_id}:`, reorderError.message);
                            }
                        }

                        // E. Mark as rolled back in DB
                        await markJobItemRolledBack(item.id);
                        await incrementRolledBackItems(rollbackRun.id);

                        // 📊 Update the main job's processed count so the Dashboard progress bar moves!
                        await incrementProcessedProducts(originalJobId);
                    } else {
                        console.error(`[RollbackWorker] Skipping deletion of watermarked image for item ${item.id} because original restoration failed.`);
                    }

                } catch (itemError) {
                    console.error(`[RollbackWorker] Failed to rollback item ${item.id}:`, itemError.message);
                }
            }

            // 4. Update Original Job Status
            await updateJobStatus(originalJobId, JOB_STATUS.ROLLED_BACK);

            // 5. Complete Rollback Run
            await completeRollbackRun(rollbackRun.id, ROLLBACK_STATUS.COMPLETED);

            console.log(`[RollbackWorker] Rollback completed for job ${originalJobId}`);

        } catch (error) {
            console.error(`[RollbackWorker] Fatal error in rollback ${originalJobId}:`, error.message);
            throw error;
        }
    },
    { connection: redisConnection }
);
