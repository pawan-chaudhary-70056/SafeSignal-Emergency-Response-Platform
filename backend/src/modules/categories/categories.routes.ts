import { Router } from "express";
import { z } from "zod";
import { actorFrom, asyncHandler } from "../../lib/http.js";
import { pathParam } from "../../lib/params.js";
import { prisma } from "../../lib/prisma.js";
import { authenticate } from "../../middleware/auth.js";

const createSchema = z.object({
  name: z.string().trim().min(3).max(100),
  description: z.string().trim().max(500).optional(),
});

const updateSchema = z.object({
  name: z.string().trim().min(3).max(100).optional(),
  description: z.string().trim().max(500).optional(),
  isActive: z.boolean().optional(),
});

export const categoriesRouter = Router();

categoriesRouter.use(authenticate);

categoriesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const actor = actorFrom(req);
    const includeInactive =
      actor.role === "ADMIN" && req.query.includeInactive === "true";

    const categories = await prisma.emergencyCategory.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: "asc" },
    });

    res.json({ categories });
  }),
);

categoriesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const actor = actorFrom(req);
    if (actor.role !== "ADMIN") {
      res.status(403).json({
        error: { code: "FORBIDDEN", message: "Only administrators can create categories" },
      });
      return;
    }

    const body = createSchema.parse(req.body ?? {});
    const category = await prisma.emergencyCategory.create({
      data: {
        name: body.name,
        description: body.description ?? null,
      },
    });

    res.status(201).json({ category });
  }),
);

categoriesRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const actor = actorFrom(req);
    if (actor.role !== "ADMIN") {
      res.status(403).json({
        error: { code: "FORBIDDEN", message: "Only administrators can update categories" },
      });
      return;
    }

    const body = updateSchema.parse(req.body ?? {});
    const category = await prisma.emergencyCategory.update({
      where: { id: pathParam(req, "id") },
      data: {
        ...(body.name === undefined ? {} : { name: body.name }),
        ...(body.description === undefined ? {} : { description: body.description }),
        ...(body.isActive === undefined ? {} : { isActive: body.isActive }),
      },
    });

    res.json({ category });
  }),
);
