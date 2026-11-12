import { Router } from "express";
import { z } from "zod";
import { notFound } from "../../lib/errors.js";
import { actorFrom, asyncHandler } from "../../lib/http.js";
import { pathParam } from "../../lib/params.js";
import { prisma } from "../../lib/prisma.js";
import { authenticate } from "../../middleware/auth.js";

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  isRead: z.enum(["true", "false"]).optional(),
});

export const notificationsRouter = Router();

notificationsRouter.use(authenticate);

notificationsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = listQuerySchema.parse(req.query ?? {});
    const where = {
      recipientId: actorFrom(req).userId,
      ...(query.isRead ? { isRead: query.isRead === "true" } : {}),
    };

    const [notifications, totalItems] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.notification.count({ where }),
    ]);

    res.json({
      notifications,
      pagination: {
        page: query.page,
        limit: query.limit,
        totalItems,
        totalPages: Math.max(1, Math.ceil(totalItems / query.limit)),
      },
    });
  }),
);

notificationsRouter.get(
  "/unread-count",
  asyncHandler(async (req, res) => {
    const unreadCount = await prisma.notification.count({
      where: { recipientId: actorFrom(req).userId, isRead: false },
    });

    res.json({ unreadCount });
  }),
);

notificationsRouter.patch(
  "/read-all",
  asyncHandler(async (req, res) => {
    const result = await prisma.notification.updateMany({
      where: { recipientId: actorFrom(req).userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });

    res.json({ updatedCount: result.count });
  }),
);

notificationsRouter.patch(
  "/:id/read",
  asyncHandler(async (req, res) => {
    const userId = actorFrom(req).userId;
    const notificationId = pathParam(req, "id");

    // Ownership is part of the query, so another user's id can never be read.
    const notification = await prisma.notification.findFirst({
      where: { id: notificationId, recipientId: userId },
    });

    if (!notification) {
      throw notFound("Notification not found");
    }

    const updated = notification.isRead
      ? notification
      : await prisma.notification.update({
          where: { id: notification.id },
          data: { isRead: true, readAt: new Date() },
        });

    res.json({ notification: updated });
  }),
);
