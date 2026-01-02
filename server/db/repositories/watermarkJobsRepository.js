import pool from '../index.js';
import {
    CREATE_JOB,
    GET_JOB_BY_ID,
    GET_JOBS_BY_SHOP,
    UPDATE_JOB_STATUS,
    UPDATE_JOB_PROGRESS,
    START_JOB,
    COMPLETE_JOB
} from '../watermark-queries.js';
import { JOB_STATUS, JOB_TYPE } from '../../constants/watermark.js';

/**
 * Create a new watermark job
 */
export async function createWatermarkJob(shop, jobType, scopeType, scopeValue, settingsSnapshot, totalProducts) {
    const safeShop = shop?.toLowerCase();

    if (!pool) {
        throw new Error('Database pool not available');
    }

    try {
        const res = await pool.query(CREATE_JOB, [
            safeShop,
            jobType,
            JOB_STATUS.PENDING,
            scopeType,
            scopeValue,
            JSON.stringify(settingsSnapshot),
            totalProducts
        ]);

        console.log(`[WatermarkJobs] Created job ${res.rows[0].id} for ${safeShop}`);
        return res.rows[0];
    } catch (error) {
        console.error(`[WatermarkJobs] Error creating job for ${safeShop}:`, error.message);
        throw error;
    }
}

/**
 * Get job by ID
 */
export async function getWatermarkJob(jobId) {
    if (!pool) {
        throw new Error('Database pool not available');
    }

    try {
        const res = await pool.query(GET_JOB_BY_ID, [jobId]);

        if (res.rows.length === 0) {
            return null;
        }

        return res.rows[0];
    } catch (error) {
        console.error(`[WatermarkJobs] Error fetching job ${jobId}:`, error.message);
        throw error;
    }
}

/**
 * Get jobs by shop (paginated)
 */
export async function getWatermarkJobsByShop(shop, limit = 50, offset = 0) {
    const safeShop = shop?.toLowerCase();

    if (!pool) {
        return [];
    }

    try {
        const res = await pool.query(GET_JOBS_BY_SHOP, [safeShop, limit, offset]);
        return res.rows;
    } catch (error) {
        console.error(`[WatermarkJobs] Error fetching jobs for ${safeShop}:`, error.message);
        return [];
    }
}

/**
 * Update job status
 */
export async function updateJobStatus(jobId, status) {
    if (!pool) {
        throw new Error('Database pool not available');
    }

    try {
        const res = await pool.query(UPDATE_JOB_STATUS, [jobId, status]);
        console.log(`[WatermarkJobs] Updated job ${jobId} status to ${status}`);
        return res.rows[0];
    } catch (error) {
        console.error(`[WatermarkJobs] Error updating job ${jobId} status:`, error.message);
        throw error;
    }
}

/**
 * Update job progress
 */
export async function updateJobProgress(jobId, processedProducts, failedProducts) {
    if (!pool) {
        throw new Error('Database pool not available');
    }

    try {
        const res = await pool.query(UPDATE_JOB_PROGRESS, [jobId, processedProducts, failedProducts]);
        return res.rows[0];
    } catch (error) {
        console.error(`[WatermarkJobs] Error updating job ${jobId} progress:`, error.message);
        throw error;
    }
}

/**
 * Start job (set status to processing and started_at)
 */
export async function startJob(jobId) {
    if (!pool) {
        throw new Error('Database pool not available');
    }

    try {
        const res = await pool.query(START_JOB, [jobId]);
        console.log(`[WatermarkJobs] Started job ${jobId}`);
        return res.rows[0];
    } catch (error) {
        console.error(`[WatermarkJobs] Error starting job ${jobId}:`, error.message);
        throw error;
    }
}

/**
 * Complete job (set status and completed_at)
 */
export async function completeJob(jobId, status) {
    if (!pool) {
        throw new Error('Database pool not available');
    }

    try {
        const res = await pool.query(COMPLETE_JOB, [jobId, status]);
        console.log(`[WatermarkJobs] Completed job ${jobId} with status ${status}`);
        return res.rows[0];
    } catch (error) {
        console.error(`[WatermarkJobs] Error completing job ${jobId}:`, error.message);
        throw error;
    }
}

/**
 * Increment processed products count
 */
export async function incrementProcessedProducts(jobId) {
    if (!pool) {
        return;
    }

    try {
        await pool.query(
            'UPDATE watermark_jobs SET processed_products = processed_products + 1 WHERE id = $1',
            [jobId]
        );
    } catch (error) {
        console.error(`[WatermarkJobs] Error incrementing processed for ${jobId}:`, error.message);
    }
}

/**
 * Increment failed products count
 */
export async function incrementFailedProducts(jobId) {
    if (!pool) {
        return;
    }

    try {
        await pool.query(
            'UPDATE watermark_jobs SET failed_products = failed_products + 1 WHERE id = $1',
            [jobId]
        );
    } catch (error) {
        console.error(`[WatermarkJobs] Error incrementing failed for ${jobId}:`, error.message);
    }
}
