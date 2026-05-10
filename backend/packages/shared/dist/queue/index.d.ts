import { Worker, type WorkerOptions } from 'bullmq';
import type { BaseJob } from '../types/index.js';
export declare function enqueueJob(job: BaseJob): Promise<string>;
export declare function createWorker<T extends BaseJob>(queueName: string, handler: (job: T) => Promise<unknown>, options?: Partial<WorkerOptions>): Worker;
export declare function getAllQueueStats(): Promise<Record<string, {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
}>>;
export declare function closeAllQueues(): Promise<void>;
//# sourceMappingURL=index.d.ts.map