/**
 * Runs the backend test suite against an isolated database.
 *
 * - loads backend/.env.test and forces it over any ambient environment, so the
 *   suite can never inherit the development DATABASE_URL;
 * - refuses any database whose name does not end in `_test`;
 * - creates the test database when missing and applies committed migrations;
 * - runs `node --test` in a child process with that environment.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { PrismaClient } from "@prisma/client";

const ENV_FILE = ".env.test";

function fail(message: string): never {
  console.error(`[test-db] ${message}`);
  process.exit(1);
}

if (!existsSync(ENV_FILE)) {
  fail(`missing ${ENV_FILE}. It defines the isolated test database and Redis index.`);
}

Object.assign(process.env, parseEnv(readFileSync(ENV_FILE, "utf8")));

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  fail(`${ENV_FILE} must define DATABASE_URL.`);
}

const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\//, ""));

if (!/^[A-Za-z0-9_]+_test$/.test(databaseName)) {
  fail(
    `refusing to prepare "${databaseName}". The test database name must end in "_test" so development data is never truncated.`,
  );
}

const maintenanceUrl = new URL(databaseUrl);
maintenanceUrl.pathname = "/postgres";
maintenanceUrl.search = "";

const maintenance = new PrismaClient({ datasourceUrl: maintenanceUrl.toString() });

try {
  await maintenance.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
  console.log(`[test-db] created database ${databaseName}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);

  if (!message.includes("already exists")) {
    throw error;
  }

  console.log(`[test-db] database ${databaseName} already exists`);
} finally {
  await maintenance.$disconnect();
}

const migrate = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  env: process.env,
});

if (migrate.error) {
  fail(`could not run prisma migrate deploy: ${migrate.error.message}`);
}

if (migrate.status !== 0) {
  process.exit(migrate.status ?? 1);
}

const tests = spawnSync(
  process.execPath,
  [
    "--import",
    "tsx",
    // Optional coverage report (npm run test:coverage) using the Node test
    // runner's built-in instrumentation — no extra dependency needed.
    ...(process.argv.includes("--coverage") ? ["--experimental-test-coverage"] : []),
    "--test",
    "tests/flow.test.ts",
  ],
  {
    stdio: "inherit",
    env: process.env,
  },
);

process.exit(tests.status ?? 1);
