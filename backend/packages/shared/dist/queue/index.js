import { Queue, Worker } from 'bullmq';
// ============================================================
// QUEUE LAYER — BullMQ
// Typed job queues with priority support.
// Every user action → async job via queue.
// ============================================================
// ─── Redis Connection for BullMQ ─────────────────────────────
function getRedisConnection() {
    return {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: parseInt(process.env.REDIS_PORT ?? '6379'),
        password: process.env.REDIS_PASSWORD || undefined,
        maxRetriesPerRequest: null, // required by BullMQ
    };
}
// ─── Queue Registry ──────────────────────────────────────────
const QUEUE_NAMES = ['crawl', 'execute', 'remap', 'ai-plan'];
const queues = new Map();
function getQueue(name) {
    let q = queues.get(name);
    if (!q) {
        q = new Queue(name, {
            connection: getRedisConnection(),
            defaultJobOptions: {
                removeOnComplete: { count: 1000 },
                removeOnFail: { count: 500 },
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 2000,
                },
            },
        });
        queues.set(name, q);
    }
    return q;
}
// ─── Priority Mapping ────────────────────────────────────────
const PRIORITY_MAP = {
    critical: 1,
    high: 2,
    normal: 5,
    low: 10,
};
// ─── Enqueue Job ─────────────────────────────────────────────
export async function enqueueJob(job) {
    const queue = getQueue(job.type);
    const bullJob = await queue.add(job.type, job, {
        jobId: job.id,
        priority: PRIORITY_MAP[job.priority] ?? 5,
    });
    console.log(`[Queue] Enqueued ${job.type} job ${job.id} (priority: ${job.priority})`);
    return bullJob.id ?? job.id;
}
// ─── Create Worker ───────────────────────────────────────────
export function createWorker(queueName, handler, options = {}) {
    const worker = new Worker(queueName, async (bullJob) => {
        const jobData = bullJob.data;
        console.log(`[Worker:${queueName}] Processing job ${jobData.id}`);
        return handler(jobData);
    }, {
        connection: getRedisConnection(),
        concurrency: options.concurrency ?? 5,
        ...options,
    });
    worker.on('completed', (job) => {
        console.log(`[Worker:${queueName}] ✅ Completed: ${job?.id}`);
    });
    worker.on('failed', (job, err) => {
        console.error(`[Worker:${queueName}] ❌ Failed: ${job?.id} — ${err.message}`);
    });
    worker.on('error', (err) => {
        console.error(`[Worker:${queueName}] Error:`, err.message);
    });
    console.log(`[Queue] Worker registered for "${queueName}" (concurrency: ${options.concurrency ?? 5})`);
    return worker;
}
// ─── Queue Stats ─────────────────────────────────────────────
export async function getAllQueueStats() {
    const stats = {};
    for (const name of QUEUE_NAMES) {
        const q = getQueue(name);
        const [waiting, active, completed, failed, delayed] = await Promise.all([
            q.getWaitingCount(),
            q.getActiveCount(),
            q.getCompletedCount(),
            q.getFailedCount(),
            q.getDelayedCount(),
        ]);
        stats[name] = { waiting, active, completed, failed, delayed };
    }
    return stats;
}
// ─── Graceful Shutdown ───────────────────────────────────────
export async function closeAllQueues() {
    await Promise.all([...queues.values()].map((q) => q.close()));
    queues.clear();
}
//# sourceMappingURL=index.js.map