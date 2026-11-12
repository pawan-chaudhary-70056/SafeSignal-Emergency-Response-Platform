import { existsSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

// Respect an explicitly provided DATABASE_URL (tests, containers, deployments)
// instead of overwriting it from the local .env file.
if (
  !process.env.DATABASE_URL &&
  typeof process.loadEnvFile === "function" &&
  existsSync(".env")
) {
  process.loadEnvFile(".env");
}

export const prisma = new PrismaClient();
