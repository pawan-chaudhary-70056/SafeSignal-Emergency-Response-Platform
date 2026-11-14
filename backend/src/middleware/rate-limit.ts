import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { getRedis } from "../lib/redis.js";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const maxTrackedKeys = 5000;
const redisKeyPrefix = "safesignal:ratelimit:";

// Atomic increment + first-hit expiry so the window is shared by every instance.
const incrementScript = `
local current = redis.call("INCR", KEYS[1])
if current == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("PTTL", KEYS[1])
return {current, ttl}
`;

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  key: string;
}

/** Test helper: clears both the Redis counters and the in-memory fallback. */
export async function resetRateLimits(): Promise<void> {
  buckets.clear();

  const redis = await getRedis();
  if (!redis) {
    return;
  }

  try {
    const keys = await redis.keys(`${redisKeyPrefix}*`);
    if (keys.length > 0) {
      await redis.del(keys);
    }
  } catch (error) {
    logger.warn("Redis rate limit reset failed", error);
  }
}

function setHeaders(res: Response, max: number, count: number, ttlMs: number): void {
  res.setHeader("RateLimit-Limit", max);
  res.setHeader("RateLimit-Remaining", Math.max(0, max - count));
  res.setHeader("RateLimit-Reset", Math.ceil((Date.now() + Math.max(0, ttlMs)) / 1000));
}

/**
 * Fixed-window limiter shared through Redis so every API instance sees the same
 * counter. If Redis is not configured or unreachable, it degrades to a local
 * in-memory window instead of failing the request.
 */
export function rateLimit({ windowMs, max, key }: RateLimitOptions) {
  return multiRateLimit([{ windowMs, max, key }]);
}

/**
 * Applies several rate-limit buckets to one request. Every bucket is
 * incremented and the request is rejected if any of them is over its cap, so
 * the tightest bucket governs rejection while each scope keeps its own window.
 */
export function multiRateLimit(buckets: RateLimitOptions[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    let headers = { max: 0, count: 0, ttlMs: 0 };

    for (const { windowMs, max, key } of buckets) {
      const identifier = `${key}:${req.ip ?? "unknown"}`;
      const { count, ttlMs } = await consume(identifier, windowMs);

      // The most restrictive bucket wins for the shared rate headers.
      if (count / max > headers.count / (headers.max || 1)) {
        headers = { max, count, ttlMs: ttlMs > 0 ? ttlMs : windowMs };
      }

      if (count > max) {
        const retryAfter = Math.max(1, Math.ceil((ttlMs > 0 ? ttlMs : windowMs) / 1000));
        res.setHeader("Retry-After", retryAfter);
        next(new AppError(429, "RATE_LIMITED", "Too many requests. Please try again later."));
        return;
      }
    }

    setHeaders(res, headers.max, headers.count, headers.ttlMs);
    next();
  };
}

/**
 * Increments one bucket atomically and returns its count and remaining TTL.
 * Redis keeps the window shared across instances; without Redis the local
 * fallback keeps working so a cache outage cannot unlock the API.
 */
async function consume(
  identifier: string,
  windowMs: number,
): Promise<{ count: number; ttlMs: number }> {
  try {
    const redis = await getRedis();

    if (redis) {
      const result = (await redis.eval(incrementScript, {
        keys: [`${redisKeyPrefix}${identifier}`],
        arguments: [String(windowMs)],
      })) as [number, number];

      return { count: Number(result[0]), ttlMs: Number(result[1]) };
    }
  } catch (error) {
    logger.warn("Redis rate limit failed; using local fallback", error);
  }

  const now = Date.now();

  if (buckets.size >= maxTrackedKeys) {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) {
        buckets.delete(key);
      }
    }
  }

  const bucket = buckets.get(identifier);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(identifier, { count: 1, resetAt: now + windowMs });
    return { count: 1, ttlMs: windowMs };
  }

  bucket.count += 1;
  return { count: bucket.count, ttlMs: bucket.resetAt - now };
}
