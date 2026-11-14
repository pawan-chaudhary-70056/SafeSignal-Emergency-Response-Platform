import { logger } from "../lib/logger.js";
import { prisma } from "../lib/prisma.js";
import { notifyParticipants } from "../modules/notifications/notifications.service.js";
import { enqueueJob } from "../worker/worker.js";
import { emitToRole, emitToUser, type RealtimeEvent } from "./index.js";

type IncidentRealtimeEvent = Exclude<
  RealtimeEvent,
  "notification.created" | "responder.availability_updated" | "incident.evidence_updated"
>;

interface PublishInput {
  incidentId: string;
  event: IncidentRealtimeEvent;
  assignmentId?: string;
}

/**
 * Publishes an event to everyone involved in an incident: dispatchers, the
 * reporting citizen, and responders holding a current or completed assignment.
 *
 * Real-time delivery must never break the committed operation, so failures are
 * logged and swallowed.
 */
/** Publishes incident events; notification.created is emitted separately. */
export async function publishIncidentEvent(input: PublishInput): Promise<void> {
  try {
    const incident = await prisma.incident.findUnique({
      where: { id: input.incidentId },
      include: { assignments: true, category: true },
    });

    if (!incident) {
      return;
    }

    const payload = {
      incidentId: incident.id,
      referenceNumber: incident.referenceNumber,
      status: incident.status,
      priority: incident.priority,
      event: input.event,
      assignmentId: input.assignmentId ?? null,
      at: new Date().toISOString(),
    };

    emitToRole("DISPATCHER", input.event, payload);
    emitToUser(incident.citizenId, input.event, payload);

    for (const assignment of incident.assignments) {
      if (assignment.status !== "REJECTED" && assignment.status !== "REASSIGNED") {
        emitToUser(assignment.responderId, input.event, payload);
      }
    }

    await notifyParticipants({ incident, event: input.event });
  } catch (error) {
    // NFR-054: queue the publish for the background worker so a failed
    // realtime/notification pass is retried instead of dropped.
    await enqueueJob("incident.notify", {
      event: input.event,
      incidentId: input.incidentId,
    });
    logger.error("Realtime event publish failed; queued for retry", error, {
      incidentId: input.incidentId,
      event: input.event,
    });
  }
}
