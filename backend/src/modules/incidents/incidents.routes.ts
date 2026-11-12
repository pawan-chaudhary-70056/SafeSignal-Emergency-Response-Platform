import { Router } from "express";
import { z } from "zod";
import { actorFrom, asyncHandler } from "../../lib/http.js";
import { pathParam } from "../../lib/params.js";
import { authenticate, requireRole } from "../../middleware/auth.js";
import { rateLimit } from "../../middleware/rate-limit.js";
import {
  closeIncident,
  createIncident,
  getIncident,
  getIncidentHistory,
  getIncidentStats,
  listIncidents,
  rejectIncident,
  reviewIncident,
  setIncidentPriority,
  verifyIncident,
} from "./incidents.service.js";

const createSchema = z.object({
  categoryId: z.string().uuid(),
  description: z.string().trim().min(5).max(2000),
  contactInformation: z.string().trim().min(6).max(255).optional(),
  location: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      description: z.string().trim().max(500).optional(),
    })
    .optional(),
});

const listQuerySchema = z.object({
  status: z
    .enum([
      "SUBMITTED",
      "UNDER_REVIEW",
      "VERIFIED",
      "ASSIGNED",
      "ACCEPTED",
      "EN_ROUTE",
      "ARRIVED",
      "IN_PROGRESS",
      "RESOLVED",
      "CLOSED",
      "REJECTED",
      "CANCELLED",
    ])
    .optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  categoryId: z.string().uuid().optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

const rejectSchema = z.object({ reason: z.string().trim().min(3).max(500) });
const prioritySchema = z.object({ priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]) });

export const incidentsRouter = Router();

incidentsRouter.use(authenticate);

incidentsRouter.post(
  "/",
  requireRole("CITIZEN"),
  rateLimit({ windowMs: 10 * 60 * 1000, max: 30, key: "incident-create" }),
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body ?? {});
    const incident = await createIncident(actorFrom(req), body);
    res.status(201).json({ incident });
  }),
);

incidentsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = listQuerySchema.parse(req.query ?? {});
    const result = await listIncidents(actorFrom(req), query);
    res.json(result);
  }),
);

// Must be registered before "/:id" so "stats" is not treated as an incident id.
incidentsRouter.get(
  "/stats",
  asyncHandler(async (req, res) => {
    res.json({ stats: await getIncidentStats(actorFrom(req)) });
  }),
);

incidentsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const incident = await getIncident(actorFrom(req), pathParam(req, "id"));
    res.json({ incident });
  }),
);

incidentsRouter.get(
  "/:id/history",
  asyncHandler(async (req, res) => {
    const history = await getIncidentHistory(actorFrom(req), pathParam(req, "id"));
    res.json({ history });
  }),
);

incidentsRouter.post(
  "/:id/review",
  requireRole("DISPATCHER"),
  asyncHandler(async (req, res) => {
    res.json({ incident: await reviewIncident(actorFrom(req), pathParam(req, "id")) });
  }),
);

incidentsRouter.post(
  "/:id/verify",
  requireRole("DISPATCHER"),
  asyncHandler(async (req, res) => {
    res.json({ incident: await verifyIncident(actorFrom(req), pathParam(req, "id")) });
  }),
);

incidentsRouter.post(
  "/:id/reject",
  requireRole("DISPATCHER"),
  asyncHandler(async (req, res) => {
    const { reason } = rejectSchema.parse(req.body ?? {});
    res.json({ incident: await rejectIncident(actorFrom(req), pathParam(req, "id"), reason) });
  }),
);

incidentsRouter.patch(
  "/:id/priority",
  requireRole("DISPATCHER"),
  asyncHandler(async (req, res) => {
    const { priority } = prioritySchema.parse(req.body ?? {});
    res.json({ incident: await setIncidentPriority(actorFrom(req), pathParam(req, "id"), priority) });
  }),
);

incidentsRouter.post(
  "/:id/close",
  requireRole("DISPATCHER"),
  asyncHandler(async (req, res) => {
    res.json({ incident: await closeIncident(actorFrom(req), pathParam(req, "id")) });
  }),
);
