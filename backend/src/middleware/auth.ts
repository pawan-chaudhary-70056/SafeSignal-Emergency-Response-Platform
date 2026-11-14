import type { NextFunction, Request, Response } from "express";
import { AppError, forbidden, unauthorized } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { hashSessionToken, parseCookies, SESSION_COOKIE } from "../lib/session.js";
import { identifyRole, type RoleCode } from "../modules/roles/index.js";

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (!token) {
      throw unauthorized();
    }

    const session = await prisma.session.findUnique({
      where: { tokenHash: hashSessionToken(token) },
      include: { user: { include: { role: true } } },
    });

    if (!session || session.revokedAt !== null || session.expiresAt.getTime() <= Date.now()) {
      throw unauthorized("Session is invalid or has expired");
    }

    if (session.user.accountStatus !== "ACTIVE") {
      throw new AppError(403, "ACCOUNT_INACTIVE", "This account is not active");
    }

    const identified = identifyRole({ role: session.user.role.name });
    if (!identified.ok) {
      throw new AppError(403, "UNKNOWN_ROLE", "Account role is not recognized");
    }

    req.auth = {
      userId: session.user.id,
      role: identified.role,
      sessionId: session.id,
    };

    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(...roles: RoleCode[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(unauthorized());
      return;
    }

    if (!roles.includes(req.auth.role)) {
      next(forbidden(`This action requires one of these roles: ${roles.join(", ")}`));
      return;
    }

    next();
  };
}
