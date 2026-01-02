import { Worker } from 'bullmq';
import { redisConnection } from '../config/redis.js';
import { QUEUE_NAMES, JOB_STATUS, JOB_TYPE, ROLLBACK_STATUS } from '../constants/watermark.js';
import {
    createWatermarkJob,
    updateJobStatus,
    completeJob
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
    PRODUCT_REORDER_MEDIA
} from '../graphql/watermark-queries.js';
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
            const client = new shopify.api.clients.Graphql({
                session: { shop, accessToken }
            });

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

            // 3. Process each item (Undo changes)
            for (const item of items) {
                try {
                    // A. Delete the watermarked media from Shopify
                    if (item.new_media_id) {
                        const deleteRes = await client.request(PRODUCT_DELETE_MEDIA, {
                            variables: {
                                productId: item.product_id,
                                mediaIds: [item.new_media_id]
                            }
                        });

                        if (deleteRes.data.productDeleteMedia.mediaUserErrors.length > 0) {
                            console.warn(`[RollbackWorker] Error deleting media ${item.new_media_id}:`, deleteRes.data.productDeleteMedia.mediaUserErrors[0].message);
                        }
                    }

                    // B. Restore original featured status (If it was featured, make it first again)
                    // Since we deleted the new media, the original media usually shifts back, 
                    // but to be 100% safe, we re-position the original media to its recorded original_position.
                    if (item.original_media_id && item.original_position === 1) {
                        try {
                            await client.request(PRODUCT_REORDER_MEDIA, {
                                variables: {
                                    id: item.product_id,
                                    moves: [{
                                        id: item.original_media_id,
                                        newPosition: "0" // Restore to featured position
                                    }]
                                }
                            });
                        } catch (reorderError) {
                            console.warn(`[RollbackWorker] Reorder fail (non-fatal) for ${item.product_id}:`, reorderError.message);
                        }
                    }

                    // C. Mark as rolled back in DB
                    await markJobItemRolledBack(item.id);
                    await incrementRolledBackItems(rollbackRun.id);

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
