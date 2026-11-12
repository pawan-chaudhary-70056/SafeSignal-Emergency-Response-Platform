import express, { type NextFunction, type Request, type Response } from "express";
import { ZodError } from "zod";
import { csrfProtection } from "./lib/csrf.js";
import { AppError } from "./lib/errors.js";
import { errorBody } from "./lib/http.js";
import { trustProxyValue } from "./lib/network.js";
import { adminRouter } from "./modules/admin/admin.routes.js";
import { assignmentsRouter } from "./modules/assignments/assignments.routes.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { categoriesRouter } from "./modules/categories/categories.routes.js";
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

app.get("/api/v1/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/v1", corsProtection);

// Cookie-authenticated mutations from a browser must pass the CSRF checks.
app.use("/api/v1", csrfProtection);

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/incidents", incidentsRouter);
app.use("/api/v1/notifications", notificationsRouter);
app.use("/api/v1/assignments", assignmentsRouter);
app.use("/api/v1/responders", respondersRouter);
app.use("/api/v1/categories", categoriesRouter);
app.use("/api/v1/admin", adminRouter);

app.use((_req, res) => {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found" } });
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
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

  console.error(error);
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Unexpected server error" },
  });
});
