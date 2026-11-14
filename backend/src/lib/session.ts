import { createHash, randomBytes } from "node:crypto";
import type { CookieOptions } from "express";

export const SESSION_COOKIE = "safesignal_session";

const dayMs = 24 * 60 * 60 * 1000;

export const sessionTtlMs = (): number => {
  const days = Number(process.env.SESSION_TTL_DAYS ?? 7);
  return (Number.isFinite(days) && days > 0 ? days : 7) * dayMs;
};

type SameSiteValue = "lax" | "strict" | "none";

/**
 * Cookies are HttpOnly and SameSite=Lax by default. Production always sets
 * Secure; COOKIE_SECURE and COOKIE_SAME_SITE allow an explicit deployment
 * override (for example SameSite=None behind a cross-site HTTPS frontend).
 */
const cookieSecure = (): boolean =>
  process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production";

const cookieSameSite = (): SameSiteValue => {
  const raw = (process.env.COOKIE_SAME_SITE ?? "lax").trim().toLowerCase();
  return raw === "strict" || raw === "none" ? raw : "lax";
};

const cookieDomain = (): string | undefined => {
  const domain = process.env.COOKIE_DOMAIN?.trim();
  return domain ? domain : undefined;
};

/** Shared attributes so the session and CSRF cookies stay consistent. */
export const baseCookieOptions = (): CookieOptions => {
  const sameSite = cookieSameSite();
  const domain = cookieDomain();

  return {
    sameSite,
    // Browsers reject SameSite=None without Secure, so force it in that case.
    secure: cookieSecure() || sameSite === "none",
    path: "/",
    ...(domain ? { domain } : {}),
  };
};

export const createSessionToken = (): string => randomBytes(32).toString("base64url");

export const hashSessionToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

export function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) {
    return {};
  }

  const cookies: Record<string, string> = {};
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name) {
      cookies[name] = decodeURIComponent(value);
    }
  }
  return cookies;
}

export const sessionCookieOptions = (): CookieOptions => ({
  ...baseCookieOptions(),
  httpOnly: true,
  maxAge: sessionTtlMs(),
});
