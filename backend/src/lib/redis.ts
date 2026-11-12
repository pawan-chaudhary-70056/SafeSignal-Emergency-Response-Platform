import { createClient, type RedisClientType } from "redis";

let client: RedisClientType | null = null;
let connecting: Promise<RedisClientType | null> | null = null;
let retryAt = 0;

const retryDelayMs = 10_000;

/**
 * Lazily connects to the configured Redis instance. Returns null when Redis is
 * not configured or currently unreachable so callers can fall back safely.
 */
export async function getRedis(): Promise<RedisClientType | null> {
  if (!process.env.REDIS_URL) {
    return null;
  }

  if (client?.isOpen) {
    return client;
  }

  if (Date.now() < retryAt) {
    return null;
  }

  if (!connecting) {
    connecting = (async () => {
      try {
        const created = createClient({
          url: process.env.REDIS_URL,
          socket: {
            reconnectStrategy: (retries) => Math.min(100 * (retries + 1), 3000),
          },
        });

        created.on("error", (error: Error) => {
          console.error("Redis error:", error.message);
        });

        await created.connect();
        client = created as RedisClientType;
        return client;
      } catch (error) {
        console.error("Redis unavailable:", (error as Error).message);
        retryAt = Date.now() + retryDelayMs;
        connecting = null;
        return null;
      }
    })();
  }

  return connecting;
}

export async function closeRedis(): Promise<void> {
  const current = client;
  client = null;
  connecting = null;
  retryAt = 0;

  if (current?.isOpen) {
    await current.quit().catch(() => undefined);
  }
}
