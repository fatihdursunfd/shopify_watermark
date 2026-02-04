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
    PRODUCT_VARIANTS_BULK_UPDATE,
    GET_MEDIA_STATUS,
    GET_FILE_URL
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

            // Setup main job progress for rollback tracking
            await setTotalProducts(originalJobId, items.length);
            await updateJobStatus(originalJobId, JOB_STATUS.PROCESSING);
            await pool.query('UPDATE watermark_jobs SET processed_products = 0 WHERE id = $1', [originalJobId]);

            // 3. Process each item (Undo changes)
            for (const item of items) {
                try {
                    let restoredMediaId = null;
                    let restoreSuccess = false;

                    // A. Resolve Valid Request URL (Handle GIDs vs URLs)
                    const validSourceUrl = await resolveOriginalUrl(shop, accessToken, item.original_media_url);

                    if (!validSourceUrl) {
                        console.error(`[RollbackWorker] Could not resolve valid URL for ${item.product_id} from ${item.original_media_url}. Skipping.`);
                        continue; // Skip this item to avoid deleting the only image
                    }

                    // B. Restore original media
                    try {
                        const createRes = await graphqlRequest(shop, accessToken, PRODUCT_CREATE_MEDIA, {
                            productId: item.product_id,
                            media: [{
                                originalSource: validSourceUrl,
                                mediaContentType: 'IMAGE',
                                alt: 'Restored original'
                            }]
                        });

                        const potentialMediaId = createRes.productCreateMedia?.media?.[0]?.id;

                        if (potentialMediaId) {
                            // C. 🛡️ FAIL-SAFE: Verify Media is PROCESSED
                            const isReady = await waitForMediaReady(shop, accessToken, potentialMediaId);
                            if (isReady) {
                                restoredMediaId = potentialMediaId;
                                restoreSuccess = true;
                                console.log(`[RollbackWorker] Restored and verified original image for product ${item.product_id}`);
                            } else {
                                console.error(`[RollbackWorker] Media created ${potentialMediaId} but failed processing check. Aborting delete.`);
                            }
                        } else {
                            const errors = createRes.productCreateMedia?.mediaUserErrors || [];
                            console.error(`[RollbackWorker] Failed to create media for product ${item.product_id}: ${JSON.stringify(errors)}`);
                        }
                    } catch (createErr) {
                        console.warn(`[RollbackWorker] Failed to restore original media:`, createErr.message);
                    }

                    if (restoreSuccess && restoredMediaId) {
                        // D. Reorder restored image to position 0 (First)
                        // Using '0' explicitly to ensure it becomes the featured image
                        try {
                            await graphqlRequest(shop, accessToken, PRODUCT_REORDER_MEDIA, {
                                id: item.product_id,
                                moves: [{
                                    id: restoredMediaId,
                                    newPosition: "0"
                                }]
                            });
                            console.log(`[RollbackWorker] Reordered restored image to position 0 for ${item.product_id}`);
                        } catch (reorderError) {
                            console.warn(`[RollbackWorker] Reorder fail (non-fatal) for ${item.product_id}:`, reorderError.message);
                        }

                        // E. Update variants to use restored original ID
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

                        // F. 🗑️ DELETE WATERMARKED (Only now is it safe)
                        if (item.new_media_id) {
                            try {
                                const deleteRes = await graphqlRequest(shop, accessToken, PRODUCT_DELETE_MEDIA, {
                                    productId: item.product_id,
                                    mediaIds: [item.new_media_id]
                                });
                                console.log(`[RollbackWorker] Deleted watermarked image ${item.new_media_id} for ${item.product_id}`);
                            } catch (delErr) {
                                console.warn(`[RollbackWorker] Failed to delete watermarked media ${item.new_media_id}:`, delErr.message);
                            }
                        }

                        // G. Mark as rolled back in DB
                        await markJobItemRolledBack(item.id);
                        await incrementRolledBackItems(rollbackRun.id);
                        await incrementProcessedProducts(originalJobId);
                    } else {
                        console.error(`[RollbackWorker] Skipped deletion of watermark for ${item.product_id} because restore failed.`);
                    }

                } catch (itemError) {
                    console.error(`[RollbackWorker] Failed to rollback item ${item.id}:`, itemError.message);
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

/**
 * Resolves the original media URL.
 * If it's a Shopify GID (File or MediaImage), fetches the public URL.
 */
async function resolveOriginalUrl(shop, accessToken, originalSource) {
    if (!originalSource) return null;

    // If it's already a URL, return it
    if (originalSource.startsWith('http')) return originalSource;

    // If it's a GID, we need to fetch the URL
    if (originalSource.startsWith('gid://')) {
        try {
            const res = await graphqlRequest(shop, accessToken, GET_FILE_URL, { id: originalSource });
            const url = res.node?.image?.url || res.node?.url;
            if (url) {
                console.log(`[RollbackWorker] Resolved GID ${originalSource} to URL`);
                return url;
            }
        } catch (error) {
            console.warn(`[RollbackWorker] Failed to resolve GID ${originalSource}: ${error.message}`);
        }
    }

    // Fallback: return as is (might fail if invalid)
    return originalSource;
}

/**
 * Polls the media status until it is PROCESSED or fails/times out.
 * Returns true if ready, false otherwise.
 */
async function waitForMediaReady(shop, accessToken, mediaId) {
    const MAX_RETRIES = 10;
    const DELAY_MS = 1000;

    for (let i = 0; i < MAX_RETRIES; i++) {
        try {
            const res = await graphqlRequest(shop, accessToken, GET_MEDIA_STATUS, { id: mediaId });
            const status = res.node?.status;

            // If status is PROCESSED or READY (depending on API version, usually PROCESSED for MediaImage)
            // Some older API versions might just return the object if ready.
            // If status is UPLOADING or PROCESSING, wait.
            // If status is FAILED, return false.

            if (status === 'PROCESSED' || status === 'READY') {
                return true;
            }

            if (status === 'FAILED') {
                console.error(`[RollbackWorker] Media ${mediaId} processing failed.`);
                return false;
            }

            // If no status field (older API?) but we have an image URL, assume ready?
            // "status" field is standard on MediaImage.
            if (!status && res.node?.image?.url) {
                // Optimization: Double check if url is accessible? No, just assume valid if no status field.
                return true;
            }

            await new Promise(r => setTimeout(r, DELAY_MS));
        } catch (error) {
            console.warn(`[RollbackWorker] Error polling media ${mediaId} (Attempt ${i + 1}):`, error.message);
        }
    }

    console.error(`[RollbackWorker] Timeout waiting for media ${mediaId} to be ready.`);
    return false;
}
