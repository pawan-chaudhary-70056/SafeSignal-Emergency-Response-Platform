import { randomUUID } from "node:crypto";
import type { IncidentPriority, IncidentStatus, Prisma } from "@prisma/client";
import { badRequest, conflict, notFound } from "../../lib/errors.js";
import type { Actor } from "../../lib/http.js";
import { prisma } from "../../lib/prisma.js";
import { publishIncidentEvent } from "../../realtime/publish.js";
import { assertIncidentTransition } from "./lifecycle.js";

export interface CreateIncidentInput {
  categoryId: string;
  description: string;
  contactInformation: string;
  idempotencyKey?: string;
  location?: { latitude: number; longitude: number; description?: string };
  locationDescription?: string;
}

const incidentInclude = {
  category: true,
  assignments: true,
} satisfies Prisma.IncidentInclude;

type IncidentWithRelations = Prisma.IncidentGetPayload<{ include: typeof incidentInclude }>;
type AssignmentRecord = IncidentWithRelations["assignments"][number];
type ViewerAssignment = Pick<AssignmentRecord, "id" | "incidentId" | "status" | "assignedAt">;

/**
 * A citizen-safe incident carries either the full dispatch assignment or the
 * reduced projection. Operational roles still receive the full record.
 */
type IncidentForViewer<T extends IncidentWithRelations = IncidentWithRelations> = Omit<
  T,
  "assignments"
> & { assignments: Array<AssignmentRecord | ViewerAssignment> };

export interface CreateIncidentResult {
  incident: IncidentForViewer;
  replayed: boolean;
}

/**
 * FR-035: dispatch assignment notes and responder identities are internal
 * dispatch information. Citizens receive a minimal projection — enough to show
 * the assignment count and live status, never the operational details.
 */
function sanitizeForViewer<T extends IncidentWithRelations>(
  actor: Actor,
  incident: T,
): IncidentForViewer<T> {
  if (actor.role !== "CITIZEN") {
    return incident;
  }

  return {
    ...incident,
    assignments: incident.assignments.map((assignment) => ({
      id: assignment.id,
      incidentId: assignment.incidentId,
      status: assignment.status,
      assignedAt: assignment.assignedAt,
    })),
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002"
  );
}

/**
 * Replays return the incident created by the first request, so a retried SOS
 * cannot produce duplicate dispatch work.
 */
export async function createIncident(
  actor: Actor,
  input: CreateIncidentInput,
): Promise<CreateIncidentResult> {
  const idempotencyKey = input.idempotencyKey?.trim() || null;

  if (idempotencyKey) {
    const existing = await prisma.incident.findUnique({
      where: { citizenId_idempotencyKey: { citizenId: actor.userId, idempotencyKey } },
      include: incidentInclude,
    });

    if (existing) {
      return { incident: sanitizeForViewer(actor, existing), replayed: true };
    }
  }

  const category = await prisma.emergencyCategory.findUnique({ where: { id: input.categoryId } });
  if (!category || !category.isActive) {
    throw badRequest("INVALID_CATEGORY", "The selected emergency category is not available");
  }

  try {
    const incident = await prisma.$transaction(async (tx) => {
      // The serial number drives the human readable reference, so it is assigned
      // first and the reference is filled in inside the same transaction.
      const created = await tx.incident.create({
        data: {
          referenceNumber: `tmp-${randomUUID().slice(0, 20)}`,
          citizenId: actor.userId,
          categoryId: input.categoryId,
          description: input.description,
          contactInformation: input.contactInformation,
          idempotencyKey,
          latitude: input.location?.latitude ?? null,
          longitude: input.location?.longitude ?? null,
          locationDescription: input.locationDescription ?? input.location?.description ?? null,
        },
      });

      const referenceNumber = `SS-${created.createdAt.getUTCFullYear()}-${String(
        created.serialNumber,
      ).padStart(6, "0")}`;

      const incident = await tx.incident.update({
        where: { id: created.id },
        data: { referenceNumber },
        include: incidentInclude,
      });

      await tx.incidentStatusHistory.create({
        data: {
          incidentId: incident.id,
          changedById: actor.userId,
          previousStatus: null,
          newStatus: "SUBMITTED",
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          action: "incident.created",
          entityType: "Incident",
          entityId: incident.id,
          metadata: { referenceNumber },
        },
      });

      return incident;
    });

    await publishIncidentEvent({
      incidentId: incident.id,
      event: "incident.created",
    });

    return { incident: sanitizeForViewer(actor, incident), replayed: false };
  } catch (error) {
    // Two concurrent retries can both pass the lookup above; the unique index
    // decides the winner and the loser returns the winner's incident.
    if (idempotencyKey && isUniqueConstraintError(error)) {
      const existing = await prisma.incident.findUnique({
        where: { citizenId_idempotencyKey: { citizenId: actor.userId, idempotencyKey } },
        include: incidentInclude,
      });

      if (existing) {
        return { incident: sanitizeForViewer(actor, existing), replayed: true };
      }
    }

    throw error;
  }
}

/**
 * Citizens only see their own reports, responders only incidents they are
 * assigned to, and operational/admin roles see the full dispatch scope.
 */
const incidentScope = (actor: Actor): Prisma.IncidentWhereInput => {
  if (actor.role === "CITIZEN") return { citizenId: actor.userId };
  if (actor.role === "RESPONDER") return { assignments: { some: { responderId: actor.userId } } };
  return {};
};

const STATUS_ORDER: IncidentStatus[] = [
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
];

const PRIORITY_ORDER: IncidentPriority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export async function listIncidents(
  actor: Actor,
  filters: {
    status?: IncidentStatus;
    priority?: IncidentPriority;
    categoryId?: string;
    search?: string;
    page?: number;
    limit?: number;
  },
) {
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 10;
  const where: Prisma.IncidentWhereInput = incidentScope(actor);

  if (filters.status) where.status = filters.status;
  if (filters.priority) where.priority = filters.priority;
  if (filters.categoryId) where.categoryId = filters.categoryId;
  if (filters.search) {
    where.OR = [
      { referenceNumber: { contains: filters.search, mode: "insensitive" } },
      { description: { contains: filters.search, mode: "insensitive" } },
      { locationDescription: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  const [incidents, totalItems] = await Promise.all([
    prisma.incident.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
      include: incidentInclude,
    }),
    prisma.incident.count({ where }),
  ]);

  return {
    incidents: incidents.map((incident) => sanitizeForViewer(actor, incident)),
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / limit)),
    },
  };
}

export async function getIncidentStats(actor: Actor) {
  const where = incidentScope(actor);

  const [total, statusCounts, priorityCounts, categoryCounts, resolvedIncidents, recent] =
    await Promise.all([
      prisma.incident.count({ where }),
      prisma.incident.groupBy({
        by: ["status"],
        where,
        _count: { _all: true },
      }),
      prisma.incident.groupBy({
        by: ["priority"],
        where,
        _count: { _all: true },
      }),
      prisma.incident.groupBy({
        by: ["categoryId"],
        where,
        _count: { _all: true },
      }),
      prisma.incident.findMany({
        where: { ...where, resolvedAt: { not: null } },
        select: { createdAt: true, resolvedAt: true },
      }),
      prisma.incident.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 5,
        select: {
          id: true,
          referenceNumber: true,
          status: true,
          priority: true,
          createdAt: true,
          resolvedAt: true,
          category: { select: { name: true } },
        },
      }),
    ]);

  const statusMap = new Map(statusCounts.map((row) => [row.status, row._count._all]));
  const priorityMap = new Map(priorityCounts.map((row) => [row.priority, row._count._all]));

  const categories =
    categoryCounts.length === 0
      ? []
      : await prisma.emergencyCategory.findMany({
          where: { id: { in: categoryCounts.map((row) => row.categoryId) } },
          select: { id: true, name: true },
        });
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));

  const durations = resolvedIncidents.flatMap((incident) =>
    incident.resolvedAt
      ? [(incident.resolvedAt.getTime() - incident.createdAt.getTime()) / 60_000]
      : [],
  );
  const averageResolutionMinutes =
    durations.length === 0
      ? null
      : Math.round((durations.reduce((sum, value) => sum + value, 0) / durations.length) * 10) / 10;

  return {
    total,
    active:
      total -
      (statusMap.get("CLOSED") ?? 0) -
      (statusMap.get("REJECTED") ?? 0) -
      (statusMap.get("CANCELLED") ?? 0),
    resolved: statusMap.get("RESOLVED") ?? 0,
    closed: statusMap.get("CLOSED") ?? 0,
    rejected: statusMap.get("REJECTED") ?? 0,
    cancelled: statusMap.get("CANCELLED") ?? 0,
    averageResolutionMinutes,
    byStatus: STATUS_ORDER.map((status) => ({ status, count: statusMap.get(status) ?? 0 })),
    byPriority: PRIORITY_ORDER.map((priority) => ({
      priority,
      count: priorityMap.get(priority) ?? 0,
    })),
    byCategory: categoryCounts
      .map((row) => ({
        name: categoryNames.get(row.categoryId) ?? "Unknown category",
        count: row._count._all,
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    recent,
  };
}

/**
 * Shared incident-view scoping (used by both the incident and evidence
 * modules): citizens see only their own reports, responders only incidents
 * they are assigned to, and operational roles the full dispatch scope. A
 * foreign or missing id always produces the same 404 so ids cannot be probed.
 */
export function assertIncidentScope(
  actor: Actor,
  incident: { citizenId: string; assignments: Array<{ responderId: string }> },
): void {
  if (actor.role === "CITIZEN" && incident.citizenId !== actor.userId) {
    throw notFound("Incident not found");
  }

  if (
    actor.role === "RESPONDER" &&
    !incident.assignments.some((assignment) => assignment.responderId === actor.userId)
  ) {
    throw notFound("Incident not found");
  }
}

export async function getIncident(actor: Actor, incidentId: string) {
  const incident = await prisma.incident.findUnique({
    where: { id: incidentId },
    include: {
      ...incidentInclude,
      statusHistory: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!incident) {
    throw notFound("Incident not found");
  }

  assertIncidentScope(actor, incident);

  return sanitizeForViewer(actor, incident);
}

interface TransitionOptions {
  data?: Prisma.IncidentUpdateManyMutationInput;
  historyReason?: string;
}

async function transitionIncident(
  actor: Actor,
  incidentId: string,
  next: IncidentStatus,
  options: TransitionOptions = {},
) {
  const incident = await prisma.incident.findUnique({ where: { id: incidentId } });
  if (!incident) {
    throw notFound("Incident not found");
  }

  assertIncidentTransition(incident.status, next);

  const updated = await prisma.$transaction(async (tx) => {
    const updated = await tx.incident.updateMany({
      where: { id: incidentId, status: incident.status },
      data: { status: next, ...options.data },
    });

    if (updated.count !== 1) {
      throw conflict(
        "INCIDENT_STATE_CONFLICT",
        "The incident changed while this action was processed. Reload and try again.",
      );
    }

    await tx.incidentStatusHistory.create({
      data: {
        incidentId,
        changedById: actor.userId,
        previousStatus: incident.status,
        newStatus: next,
        reason: options.historyReason ?? null,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: actor.userId,
        action: `incident.${next.toLowerCase()}`,
        entityType: "Incident",
        entityId: incidentId,
      },
    });

    return tx.incident.findUniqueOrThrow({ where: { id: incidentId }, include: incidentInclude });
  });

  await publishIncidentEvent({
    incidentId,
    event: "incident.status_updated",
  });

  return updated;
}

export const reviewIncident = (actor: Actor, incidentId: string) =>
  transitionIncident(actor, incidentId, "UNDER_REVIEW");

export const verifyIncident = (actor: Actor, incidentId: string) =>
  transitionIncident(actor, incidentId, "VERIFIED");

export const rejectIncident = (actor: Actor, incidentId: string, reason: string) =>
  transitionIncident(actor, incidentId, "REJECTED", {
    data: { rejectionReason: reason },
    historyReason: reason,
  });

export const closeIncident = (actor: Actor, incidentId: string) =>
  transitionIncident(actor, incidentId, "CLOSED", { data: { closedAt: new Date() } });

/** Lifecycle states where the reporting citizen may still cancel. */
const CITIZEN_CANCELLABLE_STATUSES: IncidentStatus[] = ["SUBMITTED", "UNDER_REVIEW", "VERIFIED"];

/**
 * FR-026: the reporting citizen may request cancellation while the incident is
 * still eligible. Ownership and the lifecycle are validated before processing,
 * so the request can never force a protected lifecycle transition — once
 * responders are dispatched only the dispatch workflow can finish the incident.
 */
export async function cancelIncident(actor: Actor, incidentId: string, reason?: string) {
  const existing = await prisma.incident.findUnique({
    where: { id: incidentId },
    select: { citizenId: true, status: true },
  });

  // Same response for missing and foreign incidents: citizens cannot probe ids.
  if (!existing || existing.citizenId !== actor.userId) {
    throw notFound("Incident not found");
  }

  if (!CITIZEN_CANCELLABLE_STATUSES.includes(existing.status)) {
    throw conflict(
      "INCIDENT_NOT_CANCELLABLE",
      "This incident has already been dispatched. Contact dispatch to withdraw it.",
    );
  }

  return transitionIncident(actor, incidentId, "CANCELLED", {
    historyReason: reason?.trim() || "Cancelled at the citizen's request",
  });
}

export async function setIncidentPriority(
  actor: Actor,
  incidentId: string,
  priority: IncidentPriority,
) {
  const incident = await prisma.incident.findUnique({ where: { id: incidentId } });
  if (!incident) {
    throw notFound("Incident not found");
  }

  const terminal: IncidentStatus[] = ["CLOSED", "REJECTED", "CANCELLED"];
  if (terminal.includes(incident.status)) {
    throw conflict("INCIDENT_FINAL", `Priority cannot be changed on a ${incident.status} incident`);
  }

  const updated = await prisma.incident.update({
    where: { id: incidentId },
    data: { priority },
    include: incidentInclude,
  });

  await prisma.auditLog.create({
    data: {
      actorId: actor.userId,
      action: "incident.priority_updated",
      entityType: "Incident",
      entityId: incidentId,
      metadata: { from: incident.priority, to: priority },
    },
  });

  await publishIncidentEvent({
    incidentId,
    event: "incident.priority_updated",
  });

  return updated;
}

export async function getIncidentHistory(actor: Actor, incidentId: string) {
  await getIncident(actor, incidentId);

  return prisma.incidentStatusHistory.findMany({
    where: { incidentId },
    orderBy: { createdAt: "asc" },
    include: {
      changedBy: {
        select: { id: true, fullName: true, role: { select: { name: true } } },
      },
    },
  });
}
