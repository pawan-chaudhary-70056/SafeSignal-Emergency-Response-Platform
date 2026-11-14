import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";
import { clearCsrfToken, issueCsrfToken } from "../../lib/csrf.js";
import { AppError, badRequest, conflict } from "../../lib/errors.js";
import { asyncHandler } from "../../lib/http.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import { prisma } from "../../lib/prisma.js";
import {
  SESSION_COOKIE,
  createSessionToken,
  hashSessionToken,
  sessionCookieOptions,
  sessionTtlMs,
} from "../../lib/session.js";
import { authenticate } from "../../middleware/auth.js";
import { multiRateLimit, rateLimit } from "../../middleware/rate-limit.js";
import { disconnectUser } from "../../realtime/index.js";
import { identifyRole } from "../roles/index.js";

const emailSchema = z.string().trim().toLowerCase().email().max(255);

const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: emailSchema,
  password: z.string().min(8).max(128),
  phone: z.string().trim().min(6).max(30).optional(),
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

const publicUser = (user: {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  accountStatus: string;
  createdAt: Date;
  role: { name: string };
}) => ({
  id: user.id,
  fullName: user.fullName,
  email: user.email,
  phone: user.phone,
  accountStatus: user.accountStatus,
  createdAt: user.createdAt,
  role: user.role.name,
});

export const authRouter = Router();

authRouter.post(
  "/register",
  rateLimit({ windowMs: 60 * 60 * 1000, max: 10, key: "register" }),
  asyncHandler(async (req, res) => {
    const body = registerSchema.parse(req.body ?? {});

    // Role is assigned by the backend. A role field sent by the client is ignored.
    const role = await prisma.role.findUnique({ where: { name: "CITIZEN" } });
    if (!role) {
      throw new AppError(500, "ROLE_NOT_CONFIGURED", "The CITIZEN role has not been seeded");
    }

    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      throw conflict("EMAIL_TAKEN", "An account with this email already exists");
    }

    const user = await prisma.user.create({
      data: {
        fullName: body.fullName,
        email: body.email,
        passwordHash: await hashPassword(body.password),
        phone: body.phone ?? null,
        roleId: role.id,
      },
      include: { role: true },
    });

    res.status(201).json({ user: publicUser(user) });
  }),
);

/**
 * Login is protected by two buckets, both scoped by client IP:
 * - Per account (IP + email): 10 attempts / 10 min, so password spraying one
 *   mailbox stays slow even from one address.
 * - Per IP: 60 attempts / 10 min, so shared offices, campus networks and full
 *   E2E suites are not locked out by the account rule alone.
 */
function loginRateLimit() {
  const windowMs = 10 * 60 * 1000;

  return (req: Request, res: Response, next: NextFunction): void => {
    const email = req.body?.email;
    const accountBuckets =
      typeof email === "string" && email.trim().length > 0
        ? [{ windowMs, max: 10, key: `login-account:${email.trim().toLowerCase().slice(0, 255)}` }]
        : [];

    multiRateLimit([...accountBuckets, { windowMs, max: 60, key: "login-ip" }])(req, res, next);
  };
}

authRouter.post(
  "/login",
  loginRateLimit(),
  asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body ?? {});

    const user = await prisma.user.findUnique({
      where: { email: body.email },
      include: { role: true },
    });

    if (!user || !(await verifyPassword(user.passwordHash, body.password))) {
      if (user) {
        await prisma.auditLog.create({
          data: {
            actorId: user.id,
            action: "auth.login_failed",
            entityType: "User",
            entityId: user.id,
          },
        });
      }

      throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
    }

    if (user.accountStatus !== "ACTIVE") {
      throw new AppError(403, "ACCOUNT_INACTIVE", "This account is not active");
    }

    const token = createSessionToken();
    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: hashSessionToken(token),
        expiresAt: new Date(Date.now() + sessionTtlMs()),
      },
    });

    res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
    issueCsrfToken(req, res);

    await prisma.auditLog.create({
      data: { actorId: user.id, action: "auth.login", entityType: "User", entityId: user.id },
    });

    const identified = identifyRole({ role: user.role.name });

    res.json({
      user: publicUser(user),
      dashboardPath: identified.ok ? identified.dashboardPath : null,
    });
  }),
);

authRouter.get(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.auth?.userId },
      include: { role: true, responderProfile: true },
    });

    if (!user) {
      throw new AppError(401, "UNAUTHENTICATED", "Session user no longer exists");
    }

    const identified = identifyRole({ role: user.role.name });

    // Sessions created before CSRF protection still receive a token on reload.
    issueCsrfToken(req, res);

    res.json({
      user: publicUser(user),
      dashboardPath: identified.ok ? identified.dashboardPath : null,
    });
  }),
);

// FR-005: every role can update the permitted profile fields. The email
// address, role and password are protected account fields, so only the
// validated display fields are taken from the request body.
const profileUpdateSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  phone: z.union([z.string().trim().min(6).max(30), z.null()]).optional(),
});

authRouter.patch(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    const actor = req.auth;
    if (!actor) {
      throw new AppError(401, "UNAUTHENTICATED", "Authentication required");
    }

    const body = profileUpdateSchema.parse(req.body ?? {});
    const changedFields = Object.keys(body);

    if (changedFields.length === 0) {
      throw badRequest("NO_CHANGES", "No supported profile fields were provided");
    }

    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: actor.userId },
        data: {
          ...(body.fullName !== undefined ? { fullName: body.fullName } : {}),
          ...(body.phone !== undefined ? { phone: body.phone } : {}),
        },
        include: { role: true, responderProfile: true },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          action: "auth.profile_updated",
          entityType: "User",
          entityId: actor.userId,
          metadata: { fields: changedFields },
        },
      });

      return updated;
    });

    res.json({ user: publicUser(user) });
  }),
);

authRouter.post(
  "/logout",
  authenticate,
  asyncHandler(async (req, res) => {
    await prisma.session.updateMany({
      where: { id: req.auth?.sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        actorId: req.auth?.userId ?? null,
        action: "auth.logout",
        entityType: "Session",
        entityId: req.auth?.sessionId ?? null,
      },
    });

    // Close live dashboard connections tied to the revoked session cookie.
    if (req.auth?.userId) {
      disconnectUser(req.auth.userId);
    }

    res.clearCookie(SESSION_COOKIE, { path: "/" });
    clearCsrfToken(res);
    res.status(204).end();
  }),
);
