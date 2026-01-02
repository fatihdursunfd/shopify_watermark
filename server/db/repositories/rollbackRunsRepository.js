import pool from '../index.js';
import {
    CREATE_ROLLBACK_RUN,
    UPDATE_ROLLBACK_PROGRESS,
    COMPLETE_ROLLBACK_RUN,
    GET_ROLLBACK_RUN_BY_JOB
} from '../watermark-queries.js';
import { ROLLBACK_STATUS } from '../../constants/watermark.js';

/**
 * Create a new rollback run
 */
export async function createRollbackRun(jobId, shop, itemsToRollback) {
    const safeShop = shop?.toLowerCase();

    if (!pool) {
        throw new Error('Database pool not available');
    }

    try {
        const res = await pool.query(CREATE_ROLLBACK_RUN, [
            jobId,
            safeShop,
            itemsToRollback
        ]);

        console.log(`[RollbackRuns] Created rollback run ${res.rows[0].id} for job ${jobId}`);
        return res.rows[0];
    } catch (error) {
        console.error(`[RollbackRuns] Error creating rollback run for job ${jobId}:`, error.message);
        throw error;
    }
}

/**
 * Update rollback progress
 */
export async function updateRollbackProgress(rollbackRunId, itemsRolledBack) {
    if (!pool) {
        throw new Error('Database pool not available');
    }

    try {
        const res = await pool.query(UPDATE_ROLLBACK_PROGRESS, [
            rollbackRunId,
            itemsRolledBack
        ]);

        return res.rows[0];
    } catch (error) {
        console.error(`[RollbackRuns] Error updating rollback run ${rollbackRunId}:`, error.message);
        throw error;
    }
}

/**
 * Complete rollback run
 */
export async function completeRollbackRun(rollbackRunId, status) {
    if (!pool) {
        throw new Error('Database pool not available');
    }

    try {
        const res = await pool.query(COMPLETE_ROLLBACK_RUN, [
            rollbackRunId,
            status
        ]);

        console.log(`[RollbackRuns] Completed rollback run ${rollbackRunId} with status ${status}`);
        return res.rows[0];
    } catch (error) {
        console.error(`[RollbackRuns] Error completing rollback run ${rollbackRunId}:`, error.message);
        throw error;
    }
}

/**
 * Get the latest rollback run for a job
 */
export async function getRollbackRunByJob(jobId) {
    if (!pool) {
        return null;
    }

    try {
        const res = await pool.query(GET_ROLLBACK_RUN_BY_JOB, [jobId]);

        if (res.rows.length === 0) {
            return null;
        }

        return res.rows[0];
    } catch (error) {
        console.error(`[RollbackRuns] Error fetching rollback run for job ${jobId}:`, error.message);
        return null;
    }
}

/**
 * Increment rolled back items count
 */
export async function incrementRolledBackItems(rollbackRunId) {
    if (!pool) {
        return;
    }

    try {
        await pool.query(
            'UPDATE rollback_runs SET items_rolled_back = items_rolled_back + 1 WHERE id = $1',
            [rollbackRunId]
        );
    } catch (error) {
        console.error(`[RollbackRuns] Error incrementing rolled back items:`, error.message);
    }
}

/**
 * Start rollback run (set status to processing and started_at)
 */
export async function startRollbackRun(rollbackRunId) {
    if (!pool) {
        throw new Error('Database pool not available');
    }

    try {
        const res = await pool.query(
            `UPDATE rollback_runs 
       SET status = $2, started_at = CURRENT_TIMESTAMP 
       WHERE id = $1 
       RETURNING *`,
            [rollbackRunId, ROLLBACK_STATUS.PROCESSING]
        );

        console.log(`[RollbackRuns] Started rollback run ${rollbackRunId}`);
        return res.rows[0];
    } catch (error) {
        console.error(`[RollbackRuns] Error starting rollback run ${rollbackRunId}:`, error.message);
        throw error;
    }
}
