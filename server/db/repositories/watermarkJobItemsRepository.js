import pool from '../index.js';
import {
    CREATE_JOB_ITEM,
    UPDATE_JOB_ITEM_COMPLETED,
    UPDATE_JOB_ITEM_FAILED,
    UPDATE_JOB_ITEM_ROLLED_BACK,
    GET_JOB_ITEMS_BY_JOB,
    GET_JOB_ITEMS_FOR_ROLLBACK,
    CHECK_DUPLICATE_HASH
} from '../watermark-queries.js';

/**
 * Create a new job item
 */
export async function createJobItem(jobId, productId, productTitle, originalMediaId, originalMediaUrl, originalPosition, originalIsFeatured, imageHash, variantIds = null) {
    if (!pool) {
        throw new Error('Database pool not available');
    }

    try {
        const res = await pool.query(CREATE_JOB_ITEM, [
            jobId,
            productId,
            productTitle,
            originalMediaId,
            originalMediaUrl,
            originalPosition,
            originalIsFeatured,
            imageHash,
            variantIds ? JSON.stringify(variantIds) : null
        ]);

        return res.rows[0];
    } catch (error) {
        console.error(`[JobItems] Error creating item for job ${jobId}:`, error.message);
        throw error;
    }
}

/**
 * Mark job item as completed
 */
export async function markJobItemCompleted(itemId, newMediaId, newMediaUrl) {
    if (!pool) {
        throw new Error('Database pool not available');
    }

    try {
        const res = await pool.query(UPDATE_JOB_ITEM_COMPLETED, [
            itemId,
            newMediaId,
            newMediaUrl
        ]);

        return res.rows[0];
    } catch (error) {
        console.error(`[JobItems] Error marking item ${itemId} completed:`, error.message);
        throw error;
    }
}

/**
 * Mark job item as failed
 */
export async function markJobItemFailed(itemId, errorMessage) {
    if (!pool) {
        throw new Error('Database pool not available');
    }

    try {
        const res = await pool.query(UPDATE_JOB_ITEM_FAILED, [
            itemId,
            errorMessage
        ]);

        return res.rows[0];
    } catch (error) {
        console.error(`[JobItems] Error marking item ${itemId} failed:`, error.message);
        throw error;
    }
}

/**
 * Mark job item as rolled back
 */
export async function markJobItemRolledBack(itemId) {
    if (!pool) {
        throw new Error('Database pool not available');
    }

    try {
        const res = await pool.query(UPDATE_JOB_ITEM_ROLLED_BACK, [itemId]);
        return res.rows[0];
    } catch (error) {
        console.error(`[JobItems] Error marking item ${itemId} rolled back:`, error.message);
        throw error;
    }
}

/**
 * Get job items by job ID (paginated)
 */
export async function getJobItems(jobId, limit = 50, offset = 0) {
    if (!pool) {
        return [];
    }

    try {
        const res = await pool.query(GET_JOB_ITEMS_BY_JOB, [jobId, limit, offset]);
        return res.rows;
    } catch (error) {
        console.error(`[JobItems] Error fetching items for job ${jobId}:`, error.message);
        return [];
    }
}

/**
 * Get all completed job items for rollback
 */
export async function getJobItemsForRollback(jobId) {
    if (!pool) {
        return [];
    }

    try {
        const res = await pool.query(GET_JOB_ITEMS_FOR_ROLLBACK, [jobId]);
        return res.rows;
    } catch (error) {
        console.error(`[JobItems] Error fetching rollback items for job ${jobId}:`, error.message);
        return [];
    }
}

/**
 * Check if image hash already exists in job (duplicate detection)
 */
export async function checkDuplicateHash(jobId, imageHash) {
    if (!pool || !imageHash) {
        return null;
    }

    try {
        const res = await pool.query(CHECK_DUPLICATE_HASH, [jobId, imageHash]);
        return res.rows.length > 0 ? res.rows[0] : null;
    } catch (error) {
        console.error(`[JobItems] Error checking duplicate hash:`, error.message);
        return null;
    }
}

/**
 * Bulk create job items (optimized for large batches)
 */
export async function bulkCreateJobItems(jobId, items) {
    if (!pool || !items || items.length === 0) {
        return [];
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const createdItems = [];

        for (const item of items) {
            const res = await client.query(CREATE_JOB_ITEM, [
                jobId,
                item.productId,
                item.productTitle,
                item.originalMediaId,
                item.originalMediaUrl,
                item.originalPosition,
                item.originalIsFeatured,
                item.imageHash,
                item.variantIds ? JSON.stringify(item.variantIds) : null
            ]);

            createdItems.push(res.rows[0]);
        }

        await client.query('COMMIT');
        console.log(`[JobItems] Bulk created ${createdItems.length} items for job ${jobId}`);

        return createdItems;
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`[JobItems] Error bulk creating items for job ${jobId}:`, error.message);
        throw error;
    } finally {
        client.release();
    }
}
