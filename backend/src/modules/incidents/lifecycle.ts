import type { IncidentStatus } from "@prisma/client";
import { conflict } from "../../lib/errors.js";

/**
 * Allowed incident transitions.
 * Source: docs/04-system-architecture/incident-and-assignment-lifecycle.md section 3.
 */
export const INCIDENT_TRANSITIONS: Record<IncidentStatus, readonly IncidentStatus[]> = {
  SUBMITTED: ["UNDER_REVIEW", "CANCELLED"],
  UNDER_REVIEW: ["VERIFIED", "REJECTED", "CANCELLED"],
  VERIFIED: ["ASSIGNED", "CANCELLED"],
  ASSIGNED: ["ACCEPTED", "VERIFIED"],
  ACCEPTED: ["EN_ROUTE"],
  EN_ROUTE: ["ARRIVED"],
  ARRIVED: ["IN_PROGRESS"],
  IN_PROGRESS: ["RESOLVED"],
  RESOLVED: ["CLOSED"],
  CLOSED: [],
  REJECTED: [],
  CANCELLED: [],
};

export function assertIncidentTransition(current: IncidentStatus, next: IncidentStatus): void {
  const allowed = INCIDENT_TRANSITIONS[current] ?? [];

  if (!allowed.includes(next)) {
    throw conflict(
      "INVALID_TRANSITION",
      `Incident cannot move from ${current} to ${next}. Allowed: ${allowed.join(", ") || "none"}`,
    );
  }
}
