/**
 * lib/ratelimit.ts
 * Per-user rate limiters backed by Upstash Redis.
 *
 * Environment variables required:
 *   UPSTASH_REDIS_REST_URL   — from Upstash console
 *   UPSTASH_REDIS_REST_TOKEN — from Upstash console
 *
 * Limiters:
 *   upload   — 10 chunk uploads / 60 s per user
 *   delete   — 20 deletes     / 60 s per user
 *   sync     —  5 syncs       / 60 s per user
 *   default  — 60 requests    / 60 s per user (general fallback)
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Lazily create the Redis client so the module can be imported in builds
// where the env vars are not yet set (e.g. CI type-check pass).
function getRedis(): Redis {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    throw new Error(
      "Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN env vars"
    );
  }
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

// Singleton map so we only construct each limiter once per process.
const limiters = new Map<string, Ratelimit>();
let redisWarningLogged = false;

function getLimiter(key: string, tokens: number, window: `${number} s`): Ratelimit {
  if (!limiters.has(key)) {
    limiters.set(
      key,
      new Ratelimit({
        redis: getRedis(),
        limiter: Ratelimit.slidingWindow(tokens, window),
        prefix: `gitstore:rl:${key}`,
        analytics: false,
      })
    );
  }
  return limiters.get(key)!;
}

export type LimiterKey = "upload" | "delete" | "sync" | "default" | "wipe";

const LIMITS: Record<LimiterKey, { tokens: number; window: `${number} s` }> = {
  upload:  { tokens: 10,  window: "60 s" },
  delete:  { tokens: 20,  window: "60 s" },
  sync:    { tokens:  5,  window: "60 s" },
  default: { tokens: 60,  window: "60 s" },
  wipe:    { tokens:  1,  window: "3600 s" },
};

/**
 * Check the rate limit for a given user and limiter category.
 * Returns `{ limited: true }` if the request should be rejected (429),
 * otherwise `{ limited: false }`.
 *
 * Gracefully returns `{ limited: false }` when Upstash is not configured
 * (i.e. during development without Redis credentials) so the app still works.
 */
export async function checkRateLimit(
  login: string,
  limiterKey: LimiterKey = "default"
): Promise<{ limited: boolean; remaining?: number; reset?: number }> {
  try {
    const { tokens, window } = LIMITS[limiterKey];
    const limiter = getLimiter(limiterKey, tokens, window);
    const result = await limiter.limit(login);
    return {
      limited: !result.success,
      remaining: result.remaining,
      reset: result.reset,
    };
  } catch {
    if (!redisWarningLogged) {
      console.warn("[ratelimit] Redis not configured — rate limiting disabled (set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to enable)");
      redisWarningLogged = true;
    }
    return { limited: false };
  }
}
