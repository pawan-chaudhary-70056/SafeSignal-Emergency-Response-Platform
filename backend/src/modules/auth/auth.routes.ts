import { Router } from "express";
import { z } from "zod";
import { clearCsrfToken, issueCsrfToken } from "../../lib/csrf.js";
import { AppError, conflict } from "../../lib/errors.js";
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
import { rateLimit } from "../../middleware/rate-limit.js";
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
  role: { name: string };
}) => ({
  id: user.id,
  fullName: user.fullName,
  email: user.email,
  phone: user.phone,
  accountStatus: user.accountStatus,
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

authRouter.post(
  "/login",
  rateLimit({ windowMs: 10 * 60 * 1000, max: 20, key: "login" }),
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

    res.clearCookie(SESSION_COOKIE, { path: "/" });
    clearCsrfToken(res);
    res.status(204).end();
  }),
);
