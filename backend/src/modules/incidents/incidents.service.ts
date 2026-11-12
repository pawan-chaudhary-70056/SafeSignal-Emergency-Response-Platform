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
  contactInformation?: string;
  location?: { latitude: number; longitude: number; description?: string };
}

const incidentInclude = {
  category: true,
  assignments: true,
} satisfies Prisma.IncidentInclude;

export async function createIncident(actor: Actor, input: CreateIncidentInput) {
  const category = await prisma.emergencyCategory.findUnique({ where: { id: input.categoryId } });
  if (!category || !category.isActive) {
    throw badRequest("INVALID_CATEGORY", "The selected emergency category is not available");
  }

  const incident = await prisma.$transaction(async (tx) => {
    // The serial number drives the human readable reference, so it is assigned
    // first and the reference is filled in inside the same transaction.
    const created = await tx.incident.create({
      data: {
        referenceNumber: `tmp-${randomUUID().slice(0, 20)}`,
        citizenId: actor.userId,
        categoryId: input.categoryId,
        description: input.description,
        contactInformation: input.contactInformation ?? null,
        latitude: input.location?.latitude ?? null,
        longitude: input.location?.longitude ?? null,
        locationDescription: input.location?.description ?? null,
      },
    });

    const referenceNumber = `SS-${created.createdAt.getUTCFullYear()}-${String(
      created.serialNumber,
    ).padStart(6, "0")}`;

    const incident = await tx.incident.update({
      where: { id: created.id },
      data: { referenceNumber },
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

  return incident;
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
    incidents,
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
    active: total -
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

  if (actor.role === "CITIZEN" && incident.citizenId !== actor.userId) {
    throw notFound("Incident not found");
  }

  if (
    actor.role === "RESPONDER" &&
    !incident.assignments.some((assignment) => assignment.responderId === actor.userId)
  ) {
    throw notFound("Incident not found");
  }

  return incident;
}

interface TransitionOptions {
  data?: Prisma.IncidentUpdateManyMutationInput;
  historyReason?: string;
}

export async function transitionIncident(
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
