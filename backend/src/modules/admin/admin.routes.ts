import { Router } from "express";
import { z } from "zod";
import { badRequest, conflict, notFound } from "../../lib/errors.js";
import { asyncHandler } from "../../lib/http.js";
import { pathParam } from "../../lib/params.js";
import { hashPassword } from "../../lib/password.js";
import { prisma } from "../../lib/prisma.js";
import { authenticate, requireRole } from "../../middleware/auth.js";
import { disconnectUser } from "../../realtime/index.js";
import { ROLES } from "../roles/index.js";

const roleSchema = z.object({ role: z.enum(ROLES) });
const accountStatusSchema = z.object({
  accountStatus: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]),
});

// FR-040 (Administrator part): admins may correct the permitted display
// fields of any account. Email, role and password stay on their own endpoints.
const userProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  phone: z.union([z.string().trim().min(6).max(30), z.null()]).optional(),
});

const createUserSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(8).max(128),
  phone: z.string().trim().min(6).max(30).optional(),
  role: z.enum(ROLES),
  responderType: z.string().trim().min(2).max(80).optional(),
});

const userQuerySchema = z.object({
  role: z.enum(ROLES).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

const auditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  action: z.string().trim().min(1).max(100).optional(),
});

const userSelection = {
  id: true,
  fullName: true,
  email: true,
  phone: true,
  accountStatus: true,
  createdAt: true,
  role: { select: { name: true } },
} as const;

export const adminRouter = Router();

adminRouter.use(authenticate, requireRole("ADMIN"));

adminRouter.post(
  "/users",
  asyncHandler(async (req, res) => {
    const body = createUserSchema.parse(req.body ?? {});
    const actorId = req.auth?.userId ?? null;

    const roleRecord = await prisma.role.findUnique({ where: { name: body.role } });
    if (!roleRecord) {
      throw notFound(`Role ${body.role} is not configured`);
    }

    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      throw conflict("EMAIL_TAKEN", "An account with this email already exists");
    }

    const passwordHash = await hashPassword(body.password);

    try {
      const user = await prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            fullName: body.fullName,
            email: body.email,
            passwordHash,
            phone: body.phone ?? null,
            roleId: roleRecord.id,
            // Responder accounts need a profile before dispatch can assign them.
            ...(body.role === "RESPONDER"
              ? {
                  responderProfile: {
                    create: { responderType: body.responderType ?? "GENERAL" },
                  },
                }
              : {}),
          },
          select: userSelection,
        });

        await tx.auditLog.create({
          data: {
            actorId,
            action: "admin.user_created",
            entityType: "User",
            entityId: created.id,
            metadata: { role: body.role },
          },
        });

        return created;
      });

      res.status(201).json({ user });
    } catch (error) {
      // The pre-check handles normal use; the unique index wins any race.
      if (
        typeof error === "object" &&
        error !== null &&
        (error as { code?: string }).code === "P2002"
      ) {
        throw conflict("EMAIL_TAKEN", "An account with this email already exists");
      }
      throw error;
    }
  }),
);

adminRouter.get(
  "/users",
  asyncHandler(async (req, res) => {
    const query = userQuerySchema.parse(req.query ?? {});
    const where = query.role ? { role: { name: query.role } } : {};

    const [users, totalItems] = await Promise.all([
      prisma.user.findMany({
        where,
        select: userSelection,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.user.count({ where }),
    ]);

    res.json({
      users,
      pagination: {
        page: query.page,
        limit: query.limit,
        totalItems,
        totalPages: Math.max(1, Math.ceil(totalItems / query.limit)),
      },
    });
  }),
);

adminRouter.patch(
  "/users/:id/role",
  asyncHandler(async (req, res) => {
    const actorId = req.auth?.userId;
    const { role } = roleSchema.parse(req.body ?? {});
    const userId = pathParam(req, "id");

    if (userId === actorId) {
      throw badRequest("SELF_ROLE_CHANGE", "Administrators cannot change their own role");
    }

    const roleRecord = await prisma.role.findUnique({ where: { name: role } });
    if (!roleRecord) {
      throw notFound(`Role ${role} is not configured`);
    }

    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: { roleId: roleRecord.id },
        select: userSelection,
      });

      // A responder promoted from another role needs a profile before dispatch
      // can see or assign them.
      if (role === "RESPONDER") {
        await tx.responderProfile.upsert({
          where: { userId },
          update: {},
          create: { userId, responderType: "GENERAL" },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: actorId ?? null,
          action: "admin.user_role_changed",
          entityType: "User",
          entityId: updated.id,
          metadata: { role },
        },
      });

      return updated;
    });

    // The old socket rooms carry the previous role; reconnect under the new one.
    disconnectUser(userId);

    res.json({ user });
  }),
);

adminRouter.patch(
  "/users/:id/status",
  asyncHandler(async (req, res) => {
    const actorId = req.auth?.userId;
    const { accountStatus } = accountStatusSchema.parse(req.body ?? {});
    const userId = pathParam(req, "id");

    if (userId === actorId) {
      throw badRequest(
        "SELF_STATUS_CHANGE",
        "Administrators cannot change their own account status",
      );
    }

    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: { accountStatus },
        select: userSelection,
      });

      // A non-active account must lose its sessions immediately, not on expiry.
      if (accountStatus !== "ACTIVE") {
        await tx.session.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: actorId ?? null,
          action: "admin.user_status_changed",
          entityType: "User",
          entityId: userId,
          metadata: { accountStatus },
        },
      });

      return updated;
    });

    // Revoked sessions must not keep receiving realtime events.
    if (accountStatus !== "ACTIVE") {
      disconnectUser(userId);
    }

    res.json({ user });
  }),
);

adminRouter.patch(
  "/users/:id/profile",
  asyncHandler(async (req, res) => {
    const actorId = req.auth?.userId;
    const userId = pathParam(req, "id");
    const body = userProfileSchema.parse(req.body ?? {});

    const changedFields = Object.keys(body);
    if (changedFields.length === 0) {
      throw badRequest("NO_CHANGES", "No supported profile fields were provided");
    }

    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          ...(body.fullName !== undefined ? { fullName: body.fullName } : {}),
          ...(body.phone !== undefined ? { phone: body.phone } : {}),
        },
        select: userSelection,
      });

      await tx.auditLog.create({
        data: {
          actorId: actorId ?? null,
          action: "admin.user_profile_updated",
          entityType: "User",
          entityId: userId,
          metadata: { fields: changedFields },
        },
      });

      return updated;
    });

    res.json({ user });
  }),
);

adminRouter.get(
  "/audit-logs",
  asyncHandler(async (req, res) => {
    const query = auditQuerySchema.parse(req.query ?? {});
    const where = query.action ? { action: { contains: query.action } } : {};

    const [logs, totalItems] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          actor: { select: { id: true, fullName: true, email: true } },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({
      logs,
      pagination: {
        page: query.page,
        limit: query.limit,
        totalItems,
        totalPages: Math.max(1, Math.ceil(totalItems / query.limit)),
      },
    });
  }),
);
