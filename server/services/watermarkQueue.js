import { Queue } from 'bullmq';
import { redisConnection } from '../config/redis.js';
import { QUEUE_NAMES } from '../constants/watermark.js';

/**
 * Initialize Queues
 */
export const watermarkApplyQueue = new Queue(QUEUE_NAMES.WATERMARK_APPLY, {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 5000,
        },
        removeOnComplete: true,
    }
});

export const watermarkRollbackQueue = new Queue(QUEUE_NAMES.WATERMARK_ROLLBACK, {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 5000,
        },
        removeOnComplete: true,
    }
});

/**
 * Add a new watermark apply job to the queue
 */
export async function addWatermarkJob(jobId, shop, scopeType, scopeValue) {
    try {
        const job = await watermarkApplyQueue.add(
            `watermark:${shop}:${jobId}`,
            { jobId, shop, scopeType, scopeValue },
            { jobId } // Use database ID as BullMQ job ID for easy lookup
        );

        console.log(`[Queue] Added job ${jobId} to watermark:apply queue (Queue ID: ${job.id})`);
        return job;
    } catch (error) {
        console.error('[Queue] Error adding job to queue:', error.message);
        throw error;
    }
}

/**
 * Cancel a job from the queue
 */
export async function cancelJob(jobId) {
    try {
        const job = await watermarkApplyQueue.getJob(jobId);
        if (job) {
            await job.remove();
            console.log(`[Queue] Removed pending job ${jobId} from queue`);
            return true;
        }
        return false;
    } catch (error) {
        console.error('[Queue] Error cancelling job:', error.message);
        throw error;
    }
}
