import type { NextFunction, Request, Response } from "express";
import { allowedOrigins } from "../lib/csrf.js";

const allowedMethods = "GET,POST,PATCH,DELETE,OPTIONS";
const allowedHeaders = "Content-Type, x-csrf-token";

/**
 * Baseline HTTP security headers. The API only returns JSON and never renders
 * HTML, so the CSP can stay maximally restrictive.
 */
export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  );

  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  }

  next();
}

/**
 * Credentialed CORS restricted to the configured frontend origins. Requests
 * from unknown origins receive no CORS headers, so browsers block them.
 */
export function corsProtection(req: Request, res: Response, next: NextFunction): void {
  const origin = req.get("origin");

  if (!origin || !allowedOrigins().includes(origin)) {
    next();
    return;
  }

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", allowedMethods);
    res.setHeader("Access-Control-Allow-Headers", allowedHeaders);
    res.setHeader("Access-Control-Max-Age", "600");
    res.status(204).end();
    return;
  }

  next();
}
