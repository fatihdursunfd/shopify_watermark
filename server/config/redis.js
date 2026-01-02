import IORedis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// BullMQ needs a connection option or an IORedis instance
export const redisConnection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null, // Critical for BullMQ
    enableReadyCheck: false,
});

redisConnection.on('error', (err) => {
    console.error('[Redis] Connection Error:', err.message);
});

redisConnection.on('connect', () => {
    console.log('🚀 [Redis] Connected to Key Value store');
});

export default redisConnection;
