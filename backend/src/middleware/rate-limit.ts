import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/errors.js";
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
    console.error("Redis rate limit reset failed:", (error as Error).message);
  }
}

function setHeaders(res: Response, max: number, count: number, ttlMs: number): void {
  res.setHeader("RateLimit-Limit", max);
  res.setHeader("RateLimit-Remaining", Math.max(0, max - count));
  res.setHeader("RateLimit-Reset", Math.ceil((Date.now() + Math.max(0, ttlMs)) / 1000));
}

function memoryLimit(
  identifier: string,
  windowMs: number,
  max: number,
  res: Response,
  next: NextFunction,
): void {
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
    setHeaders(res, max, 1, windowMs);
    next();
    return;
  }

  bucket.count += 1;
  setHeaders(res, max, bucket.count, bucket.resetAt - now);

  if (bucket.count > max) {
    res.setHeader("Retry-After", Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)));
    next(new AppError(429, "RATE_LIMITED", "Too many requests. Please try again later."));
    return;
  }

  next();
}

/**
 * Fixed-window limiter shared through Redis so every API instance sees the same
 * counter. If Redis is not configured or unreachable, it degrades to a local
 * in-memory window instead of failing the request.
 */
export function rateLimit({ windowMs, max, key }: RateLimitOptions) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const identifier = `${key}:${req.ip ?? "unknown"}`;

    try {
      const redis = await getRedis();

      if (redis) {
        const result = (await redis.eval(incrementScript, {
          keys: [`${redisKeyPrefix}${identifier}`],
          arguments: [String(windowMs)],
        })) as [number, number];

        const count = Number(result[0]);
        const ttlMs = Number(result[1]);
        setHeaders(res, max, count, ttlMs > 0 ? ttlMs : windowMs);

        if (count > max) {
          res.setHeader("Retry-After", Math.max(1, Math.ceil((ttlMs > 0 ? ttlMs : windowMs) / 1000)));
          next(new AppError(429, "RATE_LIMITED", "Too many requests. Please try again later."));
          return;
        }

        next();
        return;
      }
    } catch (error) {
      console.error("Redis rate limit failed, using local fallback:", (error as Error).message);
    }

    memoryLimit(identifier, windowMs, max, res, next);
  };
}
