import { Queue, Worker, QueueEvents, Job, ConnectionOptions } from 'bullmq';
import { createClient } from 'redis';
import type { BaseJob, JobType, JobPriority } from '../types/index.js';

// ============================================================
// QUEUE SYSTEM — BullMQ over Redis
// Central message bus for all async jobs
// ============================================================

const PRIORITY_MAP: Record<JobPriority, number> = {
  critical: 1,
  high: 2,
  normal: 3,
  low: 4,
};

const QUEUE_NAMES: Record<JobType, string> = {
  'crawl':        'queue:crawl',
  'execute':      'queue:execute',
  'remap':        'queue:remap',
  'ai-plan':      'queue:ai-plan',
  'health-check': 'queue:health-check',
};

const CONCURRENCY_MAP: Record<JobType, number> = {
  'crawl':        3,
  'execute':      10,
  'remap':        2,
  'ai-plan':      5,
  'health-check': 5,
};

// ─── Connection ──────────────────────────────────────────────

export function getRedisConnection(): ConnectionOptions {
  return {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379'),
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,   // Required for BullMQ
  };
}

// ─── Queue Factory ───────────────────────────────────────────

const queues = new Map<string, Queue>();

export function getQueue(jobType: JobType): Queue {
  const name = QUEUE_NAMES[jobType];
  if (!queues.has(name)) {
    queues.set(name, new Queue(name, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 1000, age: 86400 },
        removeOnFail: { count: 500, age: 604800 },
      },
    }));
  }
  return queues.get(name)!;
}

// ─── Job Publisher ───────────────────────────────────────────

export async function enqueueJob<T extends BaseJob>(job: T): Promise<string> {
  const queue = getQueue(job.type);
  const bullJob = await queue.add(
    job.type,
    job,
    {
      priority: PRIORITY_MAP[job.priority],
      jobId: job.id,
      delay: 0,
    }
  );
  return bullJob.id!;
}

export async function enqueueJobDelayed<T extends BaseJob>(
  job: T,
  delayMs: number
): Promise<string> {
  const queue = getQueue(job.type);
  const bullJob = await queue.add(job.type, job, {
    priority: PRIORITY_MAP[job.priority],
    jobId: job.id,
    delay: delayMs,
  });
  return bullJob.id!;
}

// ─── Worker Factory ──────────────────────────────────────────

export type JobProcessor<T extends BaseJob> = (job: T) => Promise<void>;

export function createWorker<T extends BaseJob>(
  jobType: JobType,
  processor: JobProcessor<T>,
  opts?: { concurrency?: number }
): Worker {
  const name = QUEUE_NAMES[jobType];
  const concurrency = opts?.concurrency ?? CONCURRENCY_MAP[jobType];

  const worker = new Worker(
    name,
    async (bullJob: Job) => {
      const jobData = bullJob.data as T;
      await processor(jobData);
    },
    {
      connection: getRedisConnection(),
      concurrency,
      limiter: {
        max: concurrency * 2,
        duration: 1000,
      },
    }
  );

  worker.on('completed', (job) => {
    console.log(`[Worker:${jobType}] ✅ Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Worker:${jobType}] ❌ Job ${job?.id} failed:`, err.message);
  });

  worker.on('stalled', (jobId) => {
    console.warn(`[Worker:${jobType}] ⚠️ Job ${jobId} stalled`);
  });

  return worker;
}

// ─── Queue Events (for monitoring) ───────────────────────────

export function createQueueEvents(jobType: JobType): QueueEvents {
  return new QueueEvents(QUEUE_NAMES[jobType], {
    connection: getRedisConnection(),
  });
}

// ─── Queue Health ─────────────────────────────────────────────

export async function getQueueStats(jobType: JobType) {
  const queue = getQueue(jobType);
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ]);
  return { waiting, active, completed, failed, delayed };
}

export async function getAllQueueStats() {
  const types: JobType[] = ['crawl', 'execute', 'remap', 'ai-plan', 'health-check'];
  const stats: Record<string, Awaited<ReturnType<typeof getQueueStats>>> = {};
  await Promise.all(
    types.map(async (t) => {
      stats[t] = await getQueueStats(t);
    })
  );
  return stats;
}

// ─── Graceful Shutdown ───────────────────────────────────────

export async function drainAllQueues(): Promise<void> {
  await Promise.all([...queues.values()].map((q) => q.drain()));
}

export async function closeAllQueues(): Promise<void> {
  await Promise.all([...queues.values()].map((q) => q.close()));
}
