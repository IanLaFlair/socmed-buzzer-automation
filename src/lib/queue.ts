import { Queue } from 'bullmq';
import { config } from '../config/index.js';

export const commentQueue = new Queue('comment-jobs', {
    connection: {
        host: new URL(config.REDIS_URL).hostname || 'localhost',
        port: parseInt(new URL(config.REDIS_URL).port || '6379'),
    },
    defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
    },
});
