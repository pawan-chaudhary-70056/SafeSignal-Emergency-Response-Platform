import { Router } from "express";
import { z } from "zod";
import { actorFrom, asyncHandler } from "../../lib/http.js";
import { pathParam } from "../../lib/params.js";
import { authenticate, requireRole } from "../../middleware/auth.js";
import {
  acceptAssignment,
  createAssignment,
  getAssignment,
  listAssignments,
  reassignAssignment,
  rejectAssignment,
  updateResponseProgress,
} from "./assignments.service.js";

const createSchema = z.object({
  incidentId: z.string().uuid(),
  responderId: z.string().uuid(),
  note: z.string().trim().max(500).optional(),
});

const rejectSchema = z.object({ reason: z.string().trim().min(3).max(500) });
const reassignSchema = z.object({
  responderId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});
const resolvedSchema = z.object({
  resolutionNotes: z.string().trim().min(3).max(2000),
});

export const assignmentsRouter = Router();

assignmentsRouter.use(authenticate);

assignmentsRouter.post(
  "/",
  requireRole("DISPATCHER"),
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body ?? {});
    const assignment = await createAssignment(actorFrom(req), body);
    res.status(201).json({ assignment });
  }),
);

assignmentsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json({ assignments: await listAssignments(actorFrom(req)) });
  }),
);

assignmentsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    res.json({ assignment: await getAssignment(actorFrom(req), pathParam(req, "id")) });
  }),
);

assignmentsRouter.post(
  "/:id/accept",
  requireRole("RESPONDER"),
  asyncHandler(async (req, res) => {
    res.json({ assignment: await acceptAssignment(actorFrom(req), pathParam(req, "id")) });
  }),
);

assignmentsRouter.post(
  "/:id/reject",
  requireRole("RESPONDER"),
  asyncHandler(async (req, res) => {
    const { reason } = rejectSchema.parse(req.body ?? {});
    res.json({ assignment: await rejectAssignment(actorFrom(req), pathParam(req, "id"), reason) });
  }),
);

assignmentsRouter.post(
  "/:id/reassign",
  requireRole("DISPATCHER"),
  asyncHandler(async (req, res) => {
    const body = reassignSchema.parse(req.body ?? {});
    res.status(201).json({
      assignment: await reassignAssignment(
        actorFrom(req),
        pathParam(req, "id"),
        body.responderId,
        body.reason,
      ),
    });
  }),
);

assignmentsRouter.post(
  "/:id/en-route",
  requireRole("RESPONDER"),
  asyncHandler(async (req, res) => {
    res.json({
      assignment: await updateResponseProgress(actorFrom(req), pathParam(req, "id"), "EN_ROUTE"),
    });
  }),
);

assignmentsRouter.post(
  "/:id/arrived",
  requireRole("RESPONDER"),
  asyncHandler(async (req, res) => {
    res.json({
      assignment: await updateResponseProgress(actorFrom(req), pathParam(req, "id"), "ARRIVED"),
    });
  }),
);

assignmentsRouter.post(
  "/:id/in-progress",
  requireRole("RESPONDER"),
  asyncHandler(async (req, res) => {
    res.json({
      assignment: await updateResponseProgress(actorFrom(req), pathParam(req, "id"), "IN_PROGRESS"),
    });
  }),
);

assignmentsRouter.post(
  "/:id/resolved",
  requireRole("RESPONDER"),
  asyncHandler(async (req, res) => {
    const { resolutionNotes } = resolvedSchema.parse(req.body ?? {});
    res.json({
      assignment: await updateResponseProgress(
        actorFrom(req),
        pathParam(req, "id"),
        "RESOLVED",
        resolutionNotes,
      ),
    });
  }),
);
