import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { app } from "./app.js";
import { initRealtime } from "./realtime/index.js";

if (
  !process.env.DATABASE_URL &&
  typeof process.loadEnvFile === "function" &&
  existsSync(".env")
) {
  process.loadEnvFile(".env");
}

function fail(message: string): never {
  console.error(`SafeSignal API cannot start: ${message}`);
  console.error("Copy .env.example to .env (or set the variables in the environment) and retry.");
  process.exit(1);
}

// NFR-062: fail fast with a clear message when required configuration is
// missing or malformed, instead of failing later with an unpredictable error.
const missing = (["DATABASE_URL"] as const).filter((key) => !process.env[key]);

if (missing.length > 0) {
  fail(`missing required environment variable(s): ${missing.join(", ")}.`);
}

function assertUrl(name: string, protocols: string[]): void {
  const value = process.env[name];
  if (!value) return;

  try {
    const url = new URL(value);
    if (!protocols.includes(url.protocol)) {
      throw new Error("unexpected protocol");
    }
  } catch {
    fail(`${name} must be a valid URL using ${protocols.join(" or ")}.`);
  }
}

assertUrl("DATABASE_URL", ["postgres:", "postgresql:"]);
assertUrl("REDIS_URL", ["redis:", "rediss:"]);

const port = Number(process.env.PORT ?? 4000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  fail(`PORT must be an integer between 1 and 65535 (received "${process.env.PORT}").`);
}

const server = createServer(app);

initRealtime(server);

server.listen(port, () => {
  console.log(`SafeSignal API listening on http://localhost:${port}/api/v1`);
  console.log(`Socket.IO ready on ws://localhost:${port}/socket.io`);
});
