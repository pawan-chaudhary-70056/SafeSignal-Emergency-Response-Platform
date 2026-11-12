import { randomBytes, timingSafeEqual } from "node:crypto";
import type { CookieOptions, NextFunction, Request, Response } from "express";
import { AppError } from "./errors.js";
import { baseCookieOptions, parseCookies, sessionTtlMs } from "./session.js";

export const CSRF_COOKIE = "safesignal_csrf";
export const CSRF_HEADER = "x-csrf-token";

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);
const exemptPaths = new Set(["/auth/login", "/auth/register", "/health"]);

/**
 * The CSRF cookie is intentionally readable by the SPA (not HttpOnly) because
 * the frontend has to echo the token back in the x-csrf-token header.
 */
export const csrfCookieOptions = (): CookieOptions => ({
  ...baseCookieOptions(),
  // Readable by the SPA so it can echo the token in the x-csrf-token header.
  httpOnly: false,
  maxAge: sessionTtlMs(),
});

export function issueCsrfToken(req: Request, res: Response): string {
  const existing = parseCookies(req.headers.cookie)[CSRF_COOKIE];
  const token = existing ?? randomBytes(32).toString("base64url");
  res.cookie(CSRF_COOKIE, token, csrfCookieOptions());
  return token;
}

export function clearCsrfToken(res: Response): void {
  res.clearCookie(CSRF_COOKIE, { path: "/" });
}

export function allowedOrigins(): string[] {
  const configured = process.env.FRONTEND_ORIGINS;

  if (configured?.trim()) {
    return configured
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  return ["http://localhost:5174", "http://127.0.0.1:5174"];
}

function requestOrigin(req: Request): string | null {
  const origin = req.get("origin");
  if (origin) {
    return origin;
  }

  const referer = req.get("referer");
  if (!referer) {
    return null;
  }

  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

function tokensMatch(cookieToken: string, headerToken: string): boolean {
  const expected = Buffer.from(cookieToken);
  const received = Buffer.from(headerToken);

  return expected.length === received.length && timingSafeEqual(expected, received);
}

/**
 * CSRF protection for cookie-authenticated state-changing requests.
 *
 * Browser traffic always carries Origin (or Referer) and must come from an
 * allowed frontend origin and echo the double-submit token. Non-browser
 * clients without Origin/Referer (server-to-server, CLI, tests) cannot be
 * tricked into sending a victim's cookie, so they are not a CSRF vector.
 */
export function csrfProtection(req: Request, _res: Response, next: NextFunction): void {
  if (safeMethods.has(req.method)) {
    next();
    return;
  }

  if (exemptPaths.has(req.path)) {
    next();
    return;
  }

  const origin = requestOrigin(req);
  if (origin === null) {
    next();
    return;
  }

  if (!allowedOrigins().includes(origin)) {
    next(new AppError(403, "CSRF_ORIGIN_REJECTED", "Request origin is not allowed"));
    return;
  }

  const cookieToken = parseCookies(req.headers.cookie)[CSRF_COOKIE];
  const headerToken = req.get(CSRF_HEADER);

  if (!cookieToken || !headerToken || !tokensMatch(cookieToken, headerToken)) {
    next(new AppError(403, "CSRF_TOKEN_INVALID", "Missing or invalid CSRF token"));
    return;
  }

  next();
}
