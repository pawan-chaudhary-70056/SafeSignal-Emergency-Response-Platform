import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { app } from "./app.js";
import { logger } from "./lib/logger.js";
import { initRealtime } from "./realtime/index.js";
import { startWorker } from "./worker/worker.js";

if (!process.env.DATABASE_URL && typeof process.loadEnvFile === "function" && existsSync(".env")) {
  process.loadEnvFile(".env");
}

// NFR-062: fail fast with a clear message when required configuration is
// missing or malformed, instead of failing later with an unpredictable error.
const databaseUrl = process.env.DATABASE_URL ?? "";
const problems: string[] = [];

if (!databaseUrl) {
  problems.push("DATABASE_URL is required");
} else if (!/^postgres(ql)?:\/\//.test(databaseUrl)) {
  problems.push("DATABASE_URL must be a postgres:// or postgresql:// connection string");
}

const redisUrl = process.env.REDIS_URL;
if (redisUrl && !/^rediss?:\/\//.test(redisUrl)) {
  problems.push("REDIS_URL must be a redis:// or rediss:// connection string");
}

const port = Number(process.env.PORT ?? 4000);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  problems.push("PORT must be an integer between 1 and 65535");
}

// NFR-034: retention windows are optional but, when provided, must make sense.
for (const [name, value] of [
  ["RETENTION_NOTIFICATION_DAYS", process.env.RETENTION_NOTIFICATION_DAYS],
  ["RETENTION_SESSION_DAYS", process.env.RETENTION_SESSION_DAYS],
  ["RETENTION_SWEEP_INTERVAL_HOURS", process.env.RETENTION_SWEEP_INTERVAL_HOURS],
] as const) {
  if (value !== undefined && !(Number.isFinite(Number(value)) && Number(value) > 0)) {
    problems.push(`${name} must be a positive number of days/hours when set`);
  }
}

if (problems.length > 0) {
  logger.error("SafeSignal API cannot start", undefined, { problems });
  logger.info("Copy .env.example to .env (or set the variables in the environment) and retry.");
  process.exit(1);
}

const server = createServer(app);

startWorker();

initRealtime(server)
  .then(() => {
    server.listen(port, () => {
      logger.info("SafeSignal API started", {
        port,
        api: `http://localhost:${port}/api/v1`,
        socket: `ws://localhost:${port}/socket.io`,
      });
    });
  })
  .catch((error) => {
    logger.error("SafeSignal API failed to start realtime layer", error);
    process.exit(1);
  });
