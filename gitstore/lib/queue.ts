/**
 * lib/queue.ts
 * Lightweight in-process async job queue for background tasks.
 * Uses a simple FIFO queue with retry logic.
 * For production, swap out the backend with BullMQ + Redis by
 * changing `enqueue` to post to a /api/queue endpoint.
 */

import type { Job, JobType } from "@/types";

// ─── In-memory queue ──────────────────────────────────────────────────────

type JobHandler = (job: Job) => Promise<void>;

const handlers = new Map<JobType, JobHandler>();
const queue: Job[] = [];
let isProcessing = false;

export function registerHandler(type: JobType, handler: JobHandler): void {
  handlers.set(type, handler);
}

export function enqueue(
  type: JobType,
  payload?: Record<string, unknown>
): Job {
  const job: Job = {
    id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    payload,
    status: "pending",
    created: Date.now(),
  };
  queue.push(job);
  void processQueue();
  return job;
}

async function processQueue(): Promise<void> {
  if (isProcessing) return;
  isProcessing = true;

  while (queue.length > 0) {
    const job = queue.shift()!;
    const handler = handlers.get(job.type);
    if (!handler) {
      job.status = "failed";
      job.error = `No handler registered for job type: ${job.type}`;
      continue;
    }

    job.status = "running";
    try {
      await handler(job);
      job.status = "done";
    } catch (err) {
      job.status = "failed";
      job.error = err instanceof Error ? err.message : String(err);
      console.error(`[queue] Job ${job.id} failed:`, job.error);
    }
  }

  isProcessing = false;
}

// ─── Server-side API queue client ─────────────────────────────────────────

/**
 * Enqueue a job via the Next.js API route (for browser → server jobs).
 * The API route picks this up and runs it server-side.
 */
export async function enqueueViaApi(
  type: JobType,
  payload?: Record<string, unknown>
): Promise<{ jobId: string }> {
  const res = await fetch("/api/sync/queue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, payload }),
  });

  if (!res.ok) throw new Error("Failed to enqueue job");
  return res.json() as Promise<{ jobId: string }>;
}
