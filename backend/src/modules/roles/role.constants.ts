/**
 * Canonical SafeSignal role codes.
 *
 * These are the only accepted values for `Role.name` in the database and for
 * every authorization decision. Frontend input is never trusted directly.
 *
 * Source: docs/01-project-overview/user-roles-and-core-features.md
 */
export const ROLES = ["CITIZEN", "DISPATCHER", "RESPONDER", "ADMIN"] as const;

export type RoleCode = (typeof ROLES)[number];

export const ROLE_LABELS: Record<RoleCode, string> = {
  CITIZEN: "Citizen",
  DISPATCHER: "Dispatcher",
  RESPONDER: "Responder",
  ADMIN: "Administrator",
};

/**
 * Landing page per role after a successful login.
 * Source: docs/03-application-workflows/application-entry-and-authentication.md section 9.
 */
export const ROLE_DASHBOARD_PATHS: Record<RoleCode, string> = {
  CITIZEN: "/citizen/dashboard",
  DISPATCHER: "/dispatcher/dashboard",
  RESPONDER: "/responder/dashboard",
  ADMIN: "/admin/dashboard",
};

/**
 * Accepted database spellings that are not identical to the canonical code.
 * The documentation writes "Administrator" in prose, so both spellings resolve
 * to the same role instead of failing at runtime.
 */
const ROLE_ALIASES: Record<string, RoleCode> = {
  ADMINISTRATOR: "ADMIN",
};

/** Trims, uppercases and collapses spaces/hyphens into underscores. */
export function normalizeRoleName(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

export function isRoleCode(value: unknown): value is RoleCode {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Resolves a stored role name to a canonical code, or null when unknown. */
export function toRoleCode(value: unknown): RoleCode | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = normalizeRoleName(value);
  if (isRoleCode(normalized)) {
    return normalized;
  }

  return ROLE_ALIASES[normalized] ?? null;
}
