import { Router } from "express";
import { z } from "zod";
import { badRequest, notFound } from "../../lib/errors.js";
import { asyncHandler } from "../../lib/http.js";
import { pathParam } from "../../lib/params.js";
import { prisma } from "../../lib/prisma.js";
import { authenticate, requireRole } from "../../middleware/auth.js";
import { ROLES } from "../roles/index.js";

const roleSchema = z.object({ role: z.enum(ROLES) });
const accountStatusSchema = z.object({
  accountStatus: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]),
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

    if (pathParam(req, "id") === actorId) {
      throw badRequest("SELF_ROLE_CHANGE", "Administrators cannot change their own role");
    }

    const roleRecord = await prisma.role.findUnique({ where: { name: role } });
    if (!roleRecord) {
      throw notFound(`Role ${role} is not configured`);
    }

    const user = await prisma.user.update({
      where: { id: pathParam(req, "id") },
      data: { roleId: roleRecord.id },
      select: userSelection,
    });

    await prisma.auditLog.create({
      data: {
        actorId: actorId ?? null,
        action: "admin.user_role_changed",
        entityType: "User",
        entityId: user.id,
        metadata: { role },
      },
    });

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
