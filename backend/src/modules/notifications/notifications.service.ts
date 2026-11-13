import { prisma } from "../../lib/prisma.js";
import { emitToUser, type RealtimeEvent } from "../../realtime/index.js";

type IncidentEvent = Exclude<
  RealtimeEvent,
  "notification.created" | "responder.availability_updated" | "incident.evidence_updated"
>;

export type NotificationType =
  | "INCIDENT_SUBMITTED"
  | "INCIDENT_STATUS_UPDATED"
  | "INCIDENT_PRIORITY_UPDATED"
  | "ASSIGNMENT_CREATED"
  | "ASSIGNMENT_ACCEPTED"
  | "ASSIGNMENT_REJECTED"
  | "ASSIGNMENT_REASSIGNED"
  | "INCIDENT_RESOLVED";

export interface NotificationIncident {
  id: string;
  referenceNumber: string;
  status: string;
  priority: string;
  citizenId: string;
  category: { name: string };
  assignments: Array<{ responderId: string; status: string }>;
}

interface NotificationTemplate {
  type: NotificationType;
  title: string;
  message: string;
}

const templates: Record<
  IncidentEvent,
  (incident: NotificationIncident) => NotificationTemplate
> = {
  "incident.created": (incident) => ({
    type: "INCIDENT_SUBMITTED",
    title: "New emergency report",
    message: `${incident.referenceNumber} — ${incident.category.name} report is awaiting review.`,
  }),
  "incident.status_updated": (incident) => ({
    type: "INCIDENT_STATUS_UPDATED",
    title: "Incident status updated",
    message: `${incident.referenceNumber} is now ${incident.status.replaceAll("_", " ")}.`,
  }),
  "incident.priority_updated": (incident) => ({
    type: "INCIDENT_PRIORITY_UPDATED",
    title: "Incident priority updated",
    message: `${incident.referenceNumber} priority is now ${incident.priority}.`,
  }),
  "assignment.created": (incident) => ({
    type: "ASSIGNMENT_CREATED",
    title: "New assignment",
    message: `You have been assigned to ${incident.referenceNumber}.`,
  }),
  "assignment.accepted": (incident) => ({
    type: "ASSIGNMENT_ACCEPTED",
    title: "Assignment accepted",
    message: `${incident.referenceNumber}: the responder accepted the assignment.`,
  }),
  "assignment.rejected": (incident) => ({
    type: "ASSIGNMENT_REJECTED",
    title: "Assignment rejected",
    message: `${incident.referenceNumber}: the responder rejected the assignment.`,
  }),
  "assignment.reassigned": (incident) => ({
    type: "ASSIGNMENT_REASSIGNED",
    title: "Assignment reassigned",
    message: `${incident.referenceNumber} was reassigned to another responder.`,
  }),
  "assignment.completed": (incident) => ({
    type: "INCIDENT_RESOLVED",
    title: "Incident resolved",
    message: `${incident.referenceNumber} was marked resolved by the responder.`,
  }),
};

const currentAssignmentStatuses = new Set(["PENDING", "ACCEPTED", "COMPLETED"]);

async function dispatcherIds(): Promise<string[]> {
  const dispatchers = await prisma.user.findMany({
    where: { accountStatus: "ACTIVE", role: { name: "DISPATCHER" } },
    select: { id: true },
  });

  return dispatchers.map((user) => user.id);
}

function responderIds(incident: NotificationIncident, includeReassigned = false): string[] {
  return incident.assignments
    .filter((assignment) =>
      includeReassigned
        ? assignment.status === "PENDING" || assignment.status === "REASSIGNED"
        : currentAssignmentStatuses.has(assignment.status),
    )
    .map((assignment) => assignment.responderId);
}

function recipientsFor(
  event: IncidentEvent,
  incident: NotificationIncident,
  dispatchers: string[],
): string[] {
  switch (event) {
    case "incident.created":
      return [...dispatchers, incident.citizenId];
    case "incident.priority_updated":
      return dispatchers;
    case "incident.status_updated":
      return [incident.citizenId, ...dispatchers, ...responderIds(incident)];
    case "assignment.created":
      return responderIds(incident);
    case "assignment.reassigned":
      return responderIds(incident, true);
    case "assignment.accepted":
    case "assignment.rejected":
      return dispatchers;
    case "assignment.completed":
      return [incident.citizenId, ...dispatchers];
    default:
      return [];
  }
}

/**
 * Evidence notifications go to the opposite side only: a citizen upload tells
 * dispatchers, a dispatcher upload tells the reporting citizen. Responders are
 * not notified — they receive their evidence through the assignment.
 */
export async function notifyEvidenceAdded(input: {
  incident: { id: string; referenceNumber: string; citizenId: string };
  uploader: { id: string; role: string; fullName: string };
}): Promise<void> {
  const recipientIds =
    input.uploader.role === "CITIZEN"
      ? await dispatcherIds()
      : [input.incident.citizenId];

  if (recipientIds.length === 0) {
    return;
  }

  const created = await prisma.notification.createManyAndReturn({
    data: recipientIds.map((recipientId) => ({
      recipientId,
      type: "EVIDENCE_ADDED",
      title: "New evidence attached",
      message: `${input.incident.referenceNumber}: ${input.uploader.fullName} attached supporting evidence.`,
      entityType: "INCIDENT",
      entityId: input.incident.id,
    })),
    select: { id: true, recipientId: true },
  });

  for (const row of created) {
    emitToUser(row.recipientId, "notification.created", {
      notificationId: row.id,
      incidentId: input.incident.id,
      referenceNumber: input.incident.referenceNumber,
      type: "EVIDENCE_ADDED",
      title: "New evidence attached",
    });
  }
}

/**
 * Creates persistent notification records after a committed business operation
 * and pushes a notification.created event to each recipient.
 *
 * The caller (realtime publish) swallows failures so a notification problem can
 * never roll back or fail the committed incident/assignment operation.
 */
export async function notifyParticipants(input: {
  incident: NotificationIncident;
  event: IncidentEvent;
}): Promise<void> {
  const dispatchers = await dispatcherIds();
  const template = templates[input.event](input.incident);
  const recipientIds = [...new Set(recipientsFor(input.event, input.incident, dispatchers))];

  if (recipientIds.length === 0) {
    return;
  }

  const created = await prisma.notification.createManyAndReturn({
    data: recipientIds.map((recipientId) => ({
      recipientId,
      type: template.type,
      title: template.title,
      message: template.message,
      entityType: "INCIDENT",
      entityId: input.incident.id,
    })),
    select: { id: true, recipientId: true },
  });

  for (const row of created) {
    emitToUser(row.recipientId, "notification.created", {
      notificationId: row.id,
      incidentId: input.incident.id,
      referenceNumber: input.incident.referenceNumber,
      type: template.type,
      title: template.title,
    });
  }
}
