import { Router } from "express";
import { z } from "zod";
import { badRequest, notFound } from "../../lib/errors.js";
import { actorFrom, asyncHandler } from "../../lib/http.js";
import { prisma } from "../../lib/prisma.js";
import { authenticate, requireRole } from "../../middleware/auth.js";
import { emitToRole } from "../../realtime/index.js";

const availabilitySchema = z.object({
  availabilityStatus: z.enum(["AVAILABLE", "BUSY", "UNAVAILABLE"]),
});

const profileSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().min(6).max(30).nullable().optional(),
  responderType: z.string().trim().min(2).max(80).optional(),
});

const responderSelection = {
  id: true,
  fullName: true,
  email: true,
  phone: true,
  accountStatus: true,
  responderProfile: true,
} as const;

export const respondersRouter = Router();

respondersRouter.use(authenticate);

respondersRouter.get(
  "/",
  requireRole("DISPATCHER"),
  asyncHandler(async (req, res) => {
    const availability = z
      .enum(["AVAILABLE", "BUSY", "UNAVAILABLE"])
      .optional()
      .parse(req.query.availability);

    const responders = await prisma.user.findMany({
      where: {
        role: { name: "RESPONDER" },
        accountStatus: "ACTIVE",
        ...(availability ? { responderProfile: { availabilityStatus: availability } } : {}),
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        responderProfile: true,
      },
      orderBy: { fullName: "asc" },
    });

    res.json({ responders });
  }),
);

respondersRouter.get(
  "/me",
  requireRole("RESPONDER"),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: actorFrom(req).userId },
      select: responderSelection,
    });

    if (!user) {
      throw notFound("Responder not found");
    }

    res.json({ user });
  }),
);

respondersRouter.patch(
  "/me/availability",
  requireRole("RESPONDER"),
  asyncHandler(async (req, res) => {
    const actor = actorFrom(req);
    const { availabilityStatus } = availabilitySchema.parse(req.body ?? {});

    const updated = await prisma.responderProfile.upsert({
      where: { userId: actor.userId },
      update: { availabilityStatus },
      create: { userId: actor.userId, responderType: "GENERAL", availabilityStatus },
    });

    await prisma.auditLog.create({
      data: {
        actorId: actor.userId,
        action: "responder.availability_changed",
        entityType: "ResponderProfile",
        entityId: updated.id,
        metadata: { availabilityStatus },
      },
    });

    const responder = await prisma.user.findUniqueOrThrow({
      where: { id: actor.userId },
      select: { fullName: true, email: true },
    });

    // Dispatchers keep an available-responder list open; push the change so it
    // updates without a manual refresh.
    emitToRole("DISPATCHER", "responder.availability_updated", {
      responderId: actor.userId,
      fullName: responder.fullName,
      email: responder.email,
      availabilityStatus,
      at: new Date().toISOString(),
    });

    res.json({ responderProfile: updated });
  }),
);

respondersRouter.get(
  "/me/assignments",
  requireRole("RESPONDER"),
  asyncHandler(async (req, res) => {
    const actor = actorFrom(req);

    const assignments = await prisma.assignment.findMany({
      where: { responderId: actor.userId },
      orderBy: { assignedAt: "desc" },
      take: 100,
      include: { incident: { include: { category: true } } },
    });

    res.json({ assignments });
  }),
);

respondersRouter.patch(
  "/me",
  requireRole("RESPONDER"),
  asyncHandler(async (req, res) => {
    const actor = actorFrom(req);
    const body = profileSchema.parse(req.body ?? {});

    if (
      body.fullName === undefined &&
      body.phone === undefined &&
      body.responderType === undefined
    ) {
      throw badRequest("NO_CHANGES", "No supported fields were provided");
    }

    const user = await prisma.$transaction(async (tx) => {
      if (body.fullName !== undefined || body.phone !== undefined) {
        await tx.user.update({
          where: { id: actor.userId },
          data: {
            ...(body.fullName !== undefined ? { fullName: body.fullName } : {}),
            ...(body.phone !== undefined ? { phone: body.phone } : {}),
          },
        });
      }

      if (body.responderType !== undefined) {
        await tx.responderProfile.upsert({
          where: { userId: actor.userId },
          update: { responderType: body.responderType },
          create: { userId: actor.userId, responderType: body.responderType },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          action: "responder.profile_updated",
          entityType: "User",
          entityId: actor.userId,
          metadata: { fields: Object.keys(body) },
        },
      });

      return tx.user.findUniqueOrThrow({
        where: { id: actor.userId },
        select: responderSelection,
      });
    });

    res.json({ user });
  }),
);
