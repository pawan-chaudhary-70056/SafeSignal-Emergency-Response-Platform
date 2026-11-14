import express, { type NextFunction, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { csrfProtection } from "./lib/csrf.js";
import { AppError } from "./lib/errors.js";
import { asyncHandler, errorBody } from "./lib/http.js";
import { logger } from "./lib/logger.js";
import { trustProxyValue } from "./lib/network.js";
import { prisma } from "./lib/prisma.js";
import { getRedis } from "./lib/redis.js";
import { adminRouter } from "./modules/admin/admin.routes.js";
import { assignmentsRouter } from "./modules/assignments/assignments.routes.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { categoriesRouter } from "./modules/categories/categories.routes.js";
import { evidenceRouter, incidentEvidenceRouter } from "./modules/evidence/evidence.routes.js";
import { incidentsRouter } from "./modules/incidents/incidents.routes.js";
import { notificationsRouter } from "./modules/notifications/notifications.routes.js";
import { respondersRouter } from "./modules/responders/responders.routes.js";
import { corsProtection, securityHeaders } from "./middleware/security.js";

export const app = express();

// Env-driven so a reverse proxy's X-Forwarded-For becomes req.ip for the
// rate limiter, and X-Forwarded-Proto drives secure-cookie behaviour.
app.set("trust proxy", trustProxyValue());
app.disable("x-powered-by");

app.use(securityHeaders);
app.use(express.json({ limit: "100kb" }));

// NFR-030: report application and dependency health. The database is a hard
// dependency (503 when unreachable); Redis is optional at runtime, so a Redis
// problem degrades the report without failing the container healthcheck.
app.get(
  "/api/v1/health",
  asyncHandler(async (_req, res) => {
    // Ping both dependencies: a connected client that cannot answer PING is not
    // healthy. Redis is optional at runtime, so it degrades the report instead of
    // failing the container healthcheck.
    const [database, cache] = await Promise.allSettled([
      prisma.$queryRaw`SELECT 1`,
      getRedis().then((client) => (client ? client.ping() : null)),
    ]);

    const databaseOk = database.status === "fulfilled";
    const cacheState =
      cache.status === "fulfilled" && cache.value === "PONG" ? "connected" : "unavailable";

    if (!databaseOk) {
      res.status(503).json({
        status: "error",
        database: "unavailable",
        cache: cacheState,
      });
      return;
    }

    res.json({
      status: "ok",
      database: "connected",
      cache: cacheState,
    });
  }),
);

app.use("/api/v1", corsProtection);

// NFR-064: every API request carries a correlation id that structured error
// logs echo back, so an application error can be traced to one request.
app.use("/api/v1", (req, res, next) => {
  const requestId = req.get("x-request-id")?.slice(0, 64) || randomUUID();
  res.setHeader("x-request-id", requestId);
  next();
});

// Cookie-authenticated mutations from a browser must pass the CSRF checks.
app.use("/api/v1", csrfProtection);

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/incidents", incidentsRouter, incidentEvidenceRouter);
app.use("/api/v1/evidence", evidenceRouter);
app.use("/api/v1/notifications", notificationsRouter);
app.use("/api/v1/assignments", assignmentsRouter);
app.use("/api/v1/responders", respondersRouter);
app.use("/api/v1/categories", categoriesRouter);
app.use("/api/v1/admin", adminRouter);

app.use((_req, res) => {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found" } });
});

app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof AppError) {
    res.status(error.status).json(errorBody(error));
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request data",
        details: error.issues,
      },
    });
    return;
  }

  // express.raw raises this when an evidence upload passes the hard cap.
  if (error instanceof Error && error.name === "PayloadTooLargeError") {
    res.status(413).json({
      error: { code: "PAYLOAD_TOO_LARGE", message: "The uploaded file is too large" },
    });
    return;
  }

  const prismaCode =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "";

  if (prismaCode === "P2002") {
    res.status(409).json({
      error: { code: "DUPLICATE_RECORD", message: "A record with these values already exists" },
    });
    return;
  }

  if (prismaCode === "P2025") {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Resource not found" } });
    return;
  }

  // Structured log (NFR-064): failures carry the correlation id without any
  // request payload, credentials, or raw error response leakage.
  logger.error("Unhandled API error", error, {
    requestId: req.get("x-request-id") ?? res.getHeader("x-request-id"),
    method: req.method,
    path: req.originalUrl,
  });
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Unexpected server error" },
  });
});
