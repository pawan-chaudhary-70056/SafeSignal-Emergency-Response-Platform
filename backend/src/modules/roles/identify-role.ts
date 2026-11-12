import { ROLE_DASHBOARD_PATHS, toRoleCode, type RoleCode } from "./role.constants.js";

/**
 * Minimum shape needed to identify a role. It accepts the raw role string or
 * the Prisma relation object (`{ name }`), so the same function works for both
 * `user.role` and a joined query.
 */
export interface RoleBearingUser {
  readonly role?: string | { readonly name?: string | null } | null;
}

export type IdentifyRoleFailure = "MISSING_ROLE" | "UNKNOWN_ROLE";

export type IdentifyRoleResult =
  | {
      readonly ok: true;
      readonly role: RoleCode;
      readonly dashboardPath: string;
    }
  | {
      readonly ok: false;
      readonly reason: IdentifyRoleFailure;
    };

function readRoleName(user: RoleBearingUser | null | undefined): string | null {
  const role = user?.role;

  if (typeof role === "string") {
    return role;
  }

  if (role && typeof role.name === "string") {
    return role.name;
  }

  return null;
}

/**
 * Identifies the authenticated user's role and the dashboard it may access.
 *
 * Per docs/04-system-architecture, this happens after session verification and
 * before any permission or resource check. An unknown or missing role fails
 * closed: it never falls back to CITIZEN or any other default role.
 */
export function identifyRole(user: RoleBearingUser | null | undefined): IdentifyRoleResult {
  const rawRoleName = readRoleName(user);

  if (rawRoleName === null || rawRoleName.trim() === "") {
    return { ok: false, reason: "MISSING_ROLE" };
  }

  const role = toRoleCode(rawRoleName);
  if (role === null) {
    return { ok: false, reason: "UNKNOWN_ROLE" };
  }

  return { ok: true, role, dashboardPath: ROLE_DASHBOARD_PATHS[role] };
}
