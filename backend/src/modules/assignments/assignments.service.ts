import type { IncidentStatus, Prisma } from "@prisma/client";
import { badRequest, conflict, forbidden, notFound } from "../../lib/errors.js";
import type { Actor } from "../../lib/http.js";
import { prisma } from "../../lib/prisma.js";
import { emitToRole } from "../../realtime/index.js";
import { publishIncidentEvent } from "../../realtime/publish.js";
import { assertIncidentTransition } from "../incidents/lifecycle.js";

const activeStatuses = ["PENDING", "ACCEPTED"] as const;

// Responder dashboards render the category name, so assignments always carry it.
const assignmentInclude = {
  incident: { include: { category: true } },
} satisfies Prisma.AssignmentInclude;

async function publishResponderAvailability(
  responderId: string,
  availabilityStatus: "AVAILABLE" | "BUSY" | "UNAVAILABLE",
): Promise<void> {
  const responder = await prisma.user.findUnique({
    where: { id: responderId },
    select: { fullName: true, email: true },
  });

  if (!responder) {
    return;
  }

  emitToRole("DISPATCHER", "responder.availability_updated", {
    responderId,
    fullName: responder.fullName,
    email: responder.email,
    availabilityStatus,
    at: new Date().toISOString(),
  });
}

async function loadAssignment(assignmentId: string) {
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: assignmentInclude,
  });

  if (!assignment) {
    throw notFound("Assignment not found");
  }

  return assignment;
}

async function assertEligibleResponder(responderId: string) {
  const responder = await prisma.user.findUnique({
    where: { id: responderId },
    include: { role: true, responderProfile: true },
  });

  if (!responder || responder.role.name !== "RESPONDER") {
    throw badRequest("INVALID_RESPONDER", "Selected user is not a responder");
  }

  if (responder.accountStatus !== "ACTIVE") {
    throw badRequest("RESPONDER_INACTIVE", "Responder account is not active");
  }
}

/**
 * Atomically moves a responder from AVAILABLE to BUSY. The guarded update is
 * the concurrency lock: two dispatchers assigning the same responder cannot
 * both claim the single AVAILABLE row.
 */
async function claimResponder(tx: Prisma.TransactionClient, responderId: string): Promise<void> {
  const claimed = await tx.responderProfile.updateMany({
    where: { userId: responderId, availabilityStatus: "AVAILABLE" },
    data: { availabilityStatus: "BUSY" },
  });

  if (claimed.count !== 1) {
    throw conflict("RESPONDER_UNAVAILABLE", "Responder is not marked AVAILABLE");
  }
}

export async function createAssignment(
  actor: Actor,
  input: { incidentId: string; responderId: string; note?: string },
) {
  const incident = await prisma.incident.findUnique({ where: { id: input.incidentId } });
  if (!incident) {
    throw notFound("Incident not found");
  }

  if (incident.status !== "VERIFIED") {
    throw conflict(
      "INCIDENT_NOT_VERIFIED",
      `Incident must be VERIFIED before assignment (current: ${incident.status})`,
    );
  }

  await assertEligibleResponder(input.responderId);

  const assignment = await prisma.$transaction(async (tx) => {
    const active = await tx.assignment.findFirst({
      where: { incidentId: input.incidentId, status: { in: [...activeStatuses] } },
      select: { id: true },
    });

    if (active) {
      throw conflict("ACTIVE_ASSIGNMENT_EXISTS", "This incident already has an active assignment");
    }

    // Legacy rows may still be AVAILABLE with an active assignment, so check
    // before claiming in addition to the availability guard.
    const responderBusy = await tx.assignment.findFirst({
      where: { responderId: input.responderId, status: { in: [...activeStatuses] } },
      select: { id: true },
    });

    if (responderBusy) {
      throw conflict("RESPONDER_BUSY", "Responder already has an active assignment");
    }

    await claimResponder(tx, input.responderId);

    const assignment = await tx.assignment.create({
      data: {
        incidentId: input.incidentId,
        responderId: input.responderId,
        assignedById: actor.userId,
        assignmentNote: input.note ?? null,
      },
    });

    const updated = await tx.incident.updateMany({
      where: { id: input.incidentId, status: "VERIFIED" },
      data: { status: "ASSIGNED" },
    });

    if (updated.count !== 1) {
      throw conflict("INCIDENT_STATE_CONFLICT", "The incident state changed during assignment");
    }

    await tx.incidentStatusHistory.create({
      data: {
        incidentId: input.incidentId,
        changedById: actor.userId,
        previousStatus: "VERIFIED",
        newStatus: "ASSIGNED",
        reason: input.note ?? null,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: actor.userId,
        action: "assignment.created",
        entityType: "Assignment",
        entityId: assignment.id,
        metadata: { incidentId: input.incidentId, responderId: input.responderId },
      },
    });

    return assignment;
  });

  await publishIncidentEvent({
    incidentId: assignment.incidentId,
    event: "assignment.created",
    assignmentId: assignment.id,
  });
  await publishResponderAvailability(input.responderId, "BUSY");

  return assignment;
}

export async function acceptAssignment(actor: Actor, assignmentId: string) {
  const assignment = await loadAssignment(assignmentId);

  if (assignment.responderId !== actor.userId) {
    throw forbidden("Only the assigned responder can accept this assignment");
  }

  if (assignment.status !== "PENDING") {
    throw conflict("ASSIGNMENT_NOT_PENDING", `Assignment is ${assignment.status}`);
  }

  if (assignment.incident.status !== "ASSIGNED") {
    throw conflict(
      "INCIDENT_STATE_CONFLICT",
      `Incident must be ASSIGNED (current: ${assignment.incident.status})`,
    );
  }

  const acceptedAssignment = await prisma.$transaction(async (tx) => {
    const accepted = await tx.assignment.updateMany({
      where: { id: assignmentId, status: "PENDING" },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    });

    if (accepted.count !== 1) {
      throw conflict("ASSIGNMENT_STATE_CONFLICT", "The assignment changed during acceptance");
    }

    const incident = await tx.incident.updateMany({
      where: { id: assignment.incidentId, status: "ASSIGNED" },
      data: { status: "ACCEPTED" },
    });

    if (incident.count !== 1) {
      throw conflict("INCIDENT_STATE_CONFLICT", "The incident changed during acceptance");
    }

    await tx.incidentStatusHistory.create({
      data: {
        incidentId: assignment.incidentId,
        changedById: actor.userId,
        previousStatus: "ASSIGNED",
        newStatus: "ACCEPTED",
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: actor.userId,
        action: "assignment.accepted",
        entityType: "Assignment",
        entityId: assignmentId,
      },
    });

    return tx.assignment.findUniqueOrThrow({ where: { id: assignmentId } });
  });

  await publishIncidentEvent({
    incidentId: acceptedAssignment.incidentId,
    event: "assignment.accepted",
    assignmentId,
  });

  return acceptedAssignment;
}

export async function rejectAssignment(actor: Actor, assignmentId: string, reason: string) {
  const assignment = await loadAssignment(assignmentId);

  if (assignment.responderId !== actor.userId) {
    throw forbidden("Only the assigned responder can reject this assignment");
  }

  if (assignment.status !== "PENDING") {
    throw conflict("ASSIGNMENT_NOT_PENDING", `Assignment is ${assignment.status}`);
  }

  const rejectedAssignment = await prisma.$transaction(async (tx) => {
    const rejected = await tx.assignment.updateMany({
      where: { id: assignmentId, status: "PENDING" },
      data: { status: "REJECTED", rejectionReason: reason },
    });

    if (rejected.count !== 1) {
      throw conflict("ASSIGNMENT_STATE_CONFLICT", "The assignment changed during rejection");
    }

    // The incident returns to the dispatchable queue so a dispatcher can reassign it.
    await tx.incident.updateMany({
      where: { id: assignment.incidentId, status: "ASSIGNED" },
      data: { status: "VERIFIED" },
    });

    // Rejection frees the responder. Only BUSY is reversed, so a manually set
    // UNAVAILABLE is preserved.
    await tx.responderProfile.updateMany({
      where: { userId: assignment.responderId, availabilityStatus: "BUSY" },
      data: { availabilityStatus: "AVAILABLE" },
    });

    await tx.incidentStatusHistory.create({
      data: {
        incidentId: assignment.incidentId,
        changedById: actor.userId,
        previousStatus: assignment.incident.status,
        newStatus: "VERIFIED",
        reason: `Assignment rejected: ${reason}`,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: actor.userId,
        action: "assignment.rejected",
        entityType: "Assignment",
        entityId: assignmentId,
        metadata: { reason },
      },
    });

    return tx.assignment.findUniqueOrThrow({ where: { id: assignmentId } });
  });

  await publishIncidentEvent({
    incidentId: rejectedAssignment.incidentId,
    event: "assignment.rejected",
    assignmentId,
  });
  await publishResponderAvailability(rejectedAssignment.responderId, "AVAILABLE");

  return rejectedAssignment;
}

export async function reassignAssignment(
  actor: Actor,
  assignmentId: string,
  responderId: string,
  reason: string,
) {
  const current = await loadAssignment(assignmentId);

  if (current.status !== "PENDING" && current.status !== "ACCEPTED") {
    throw conflict("ASSIGNMENT_NOT_ACTIVE", `Assignment is ${current.status}`);
  }

  if (responderId === current.responderId) {
    throw badRequest("SAME_RESPONDER", "Replacement responder must be a different responder");
  }

  await assertEligibleResponder(responderId);

  const replacementAssignment = await prisma.$transaction(async (tx) => {
    await claimResponder(tx, responderId);

    const replaced = await tx.assignment.updateMany({
      where: { id: assignmentId, status: current.status },
      data: { status: "REASSIGNED", reassignmentReason: reason },
    });

    if (replaced.count !== 1) {
      throw conflict("ASSIGNMENT_STATE_CONFLICT", "The assignment changed during reassignment");
    }

    // Release the previous responder when the replacement claim succeeds.
    await tx.responderProfile.updateMany({
      where: { userId: current.responderId, availabilityStatus: "BUSY" },
      data: { availabilityStatus: "AVAILABLE" },
    });

    const replacement = await tx.assignment.create({
      data: {
        incidentId: current.incidentId,
        responderId,
        assignedById: actor.userId,
        assignmentNote: reason,
      },
    });

    const incident = await tx.incident.updateMany({
      where: {
        id: current.incidentId,
        status: { in: ["ASSIGNED", "ACCEPTED"] },
      },
      data: { status: "ASSIGNED" },
    });

    if (incident.count !== 1) {
      throw conflict("INCIDENT_STATE_CONFLICT", "The incident changed during reassignment");
    }

    await tx.incidentStatusHistory.create({
      data: {
        incidentId: current.incidentId,
        changedById: actor.userId,
        previousStatus: current.incident.status,
        newStatus: "ASSIGNED",
        reason: `Reassigned: ${reason}`,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: actor.userId,
        action: "assignment.reassigned",
        entityType: "Assignment",
        entityId: assignmentId,
        metadata: { replacementAssignmentId: replacement.id, responderId, reason },
      },
    });

    return replacement;
  });

  await publishIncidentEvent({
    incidentId: replacementAssignment.incidentId,
    event: "assignment.reassigned",
    assignmentId: replacementAssignment.id,
  });

  return replacementAssignment;
}

type ProgressTarget = Extract<IncidentStatus, "EN_ROUTE" | "ARRIVED" | "IN_PROGRESS" | "RESOLVED">;

export async function updateResponseProgress(
  actor: Actor,
  assignmentId: string,
  target: ProgressTarget,
  resolutionNotes?: string,
) {
  const assignment = await loadAssignment(assignmentId);

  if (assignment.responderId !== actor.userId) {
    throw forbidden("Only the assigned responder can update this assignment");
  }

  if (assignment.status !== "ACCEPTED") {
    throw conflict("ASSIGNMENT_NOT_ACCEPTED", `Assignment is ${assignment.status}`);
  }

  if (target === "RESOLVED" && !resolutionNotes?.trim()) {
    throw badRequest("RESOLUTION_NOTES_REQUIRED", "Resolution notes are required to resolve an incident");
  }

  assertIncidentTransition(assignment.incident.status, target);

  const progressAssignment = await prisma.$transaction(async (tx) => {
    const incidentData: Prisma.IncidentUpdateManyMutationInput = { status: target };
    if (target === "RESOLVED") {
      incidentData.resolvedAt = new Date();
      incidentData.resolutionNotes = resolutionNotes?.trim() ?? null;
    }

    const incident = await tx.incident.updateMany({
      where: { id: assignment.incidentId, status: assignment.incident.status },
      data: incidentData,
    });

    if (incident.count !== 1) {
      throw conflict("INCIDENT_STATE_CONFLICT", "The incident changed during this update");
    }

    if (target === "RESOLVED") {
      const completed = await tx.assignment.updateMany({
        where: { id: assignmentId, status: "ACCEPTED" },
        data: { status: "COMPLETED", completedAt: new Date() },
      });

      if (completed.count !== 1) {
        throw conflict("ASSIGNMENT_STATE_CONFLICT", "The assignment changed during resolution");
      }

      // Resolution ends the response, so BUSY responders are freed again. A
      // manually set UNAVAILABLE is preserved, matching reject and reassign.
      await tx.responderProfile.updateMany({
        where: { userId: assignment.responderId, availabilityStatus: "BUSY" },
        data: { availabilityStatus: "AVAILABLE" },
      });
    }

    await tx.incidentStatusHistory.create({
      data: {
        incidentId: assignment.incidentId,
        changedById: actor.userId,
        previousStatus: assignment.incident.status,
        newStatus: target,
        reason: target === "RESOLVED" ? (resolutionNotes?.trim() ?? null) : null,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: actor.userId,
        action: `incident.${target.toLowerCase()}`,
        entityType: "Incident",
        entityId: assignment.incidentId,
      },
    });

    return tx.assignment.findUniqueOrThrow({
      where: { id: assignmentId },
      include: assignmentInclude,
    });
  });

  await publishIncidentEvent({
    incidentId: progressAssignment.incidentId,
    event: target === "RESOLVED" ? "assignment.completed" : "incident.status_updated",
    assignmentId,
  });

  if (target === "RESOLVED") {
    // Dispatchers see the freed responder immediately.
    await publishResponderAvailability(progressAssignment.responderId, "AVAILABLE");
  }

  return progressAssignment;
}

export async function listAssignments(actor: Actor) {
  const where: Prisma.AssignmentWhereInput = {};

  if (actor.role === "RESPONDER") where.responderId = actor.userId;
  if (actor.role === "CITIZEN") where.incident = { citizenId: actor.userId };

  return prisma.assignment.findMany({
    where,
    orderBy: { assignedAt: "desc" },
    take: 100,
    include: assignmentInclude,
  });
}

export async function getAssignment(actor: Actor, assignmentId: string) {
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: assignmentInclude,
  });

  if (!assignment) {
    throw notFound("Assignment not found");
  }

  if (actor.role === "RESPONDER" && assignment.responderId !== actor.userId) {
    throw notFound("Assignment not found");
  }

  if (actor.role === "CITIZEN" && assignment.incident.citizenId !== actor.userId) {
    throw notFound("Assignment not found");
  }

  return assignment;
}
