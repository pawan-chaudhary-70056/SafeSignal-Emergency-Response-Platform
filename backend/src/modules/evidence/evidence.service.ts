import type { Incident, Prisma } from "@prisma/client";
import { badRequest, conflict, forbidden, notFound } from "../../lib/errors.js";
import type { Actor } from "../../lib/http.js";
import { prisma } from "../../lib/prisma.js";
import { emitToRole, emitToUser } from "../../realtime/index.js";
import { notifyEvidenceAdded } from "../notifications/notifications.service.js";

/** Hard cap for a single evidence file, matching the client-side check. */
export const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;

/** Only formats whose content can be verified by magic bytes are accepted. */
export const EVIDENCE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export interface EvidenceMeta {
  id: string;
  incidentId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
  uploadedBy: { id: string; fullName: string };
}

const evidenceSelection = {
  id: true,
  incidentId: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  createdAt: true,
  uploadedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.EvidenceSelect;

const evidenceContentSelection = {
  id: true,
  incidentId: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  createdAt: true,
  content: true,
  uploadedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.EvidenceSelect;

/** Lifecycle states that are finished; evidence can no longer be attached. */
const CLOSED_STATUSES = new Set(["CLOSED", "REJECTED", "CANCELLED"]);

/**
 * FR-073: validate the uploaded content where practical. The declared type is
 * never trusted — the canonical type comes from the file's magic bytes.
 */
function sniffMimeType(content: Buffer): string | null {
  if (content.length < 12) {
    return null;
  }

  if (content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png";
  }

  if (
    content.subarray(0, 4).toString("ascii") === "RIFF" &&
    content.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }

  if (content.subarray(0, 5).toString("ascii") === "%PDF-") {
    return "application/pdf";
  }

  return null;
}

function sanitizeFileName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "evidence";
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return (cleaned.length > 0 ? cleaned : "evidence").slice(0, 255);
}

type IncidentWithAssignments = Incident & {
  assignments: Array<{ responderId: string; status: string }>;
};

/**
 * Loads an incident and enforces resource-level access: citizens only their
 * own reports, responders only incidents they are assigned to, and operational
 * roles the full dispatch scope.
 */
export async function loadIncidentForViewer(
  actor: Actor,
  incidentId: string,
): Promise<IncidentWithAssignments> {
  const incident = await prisma.incident.findUnique({
    where: { id: incidentId },
    include: { assignments: { select: { responderId: true, status: true } } },
  });

  if (!incident) {
    throw notFound("Incident not found");
  }

  if (actor.role === "CITIZEN" && incident.citizenId !== actor.userId) {
    throw forbidden("You can only access your own incident reports");
  }

  if (actor.role === "RESPONDER" && !incident.assignments.some((a) => a.responderId === actor.userId)) {
    throw forbidden("You can only access incidents you are assigned to");
  }

  return incident;
}

function assertCanManageEvidence(actor: Actor, incident: IncidentWithAssignments): void {
  if (actor.role === "CITIZEN" && incident.citizenId !== actor.userId) {
    throw forbidden("You can only attach evidence to your own incident reports");
  }

  if (actor.role !== "CITIZEN" && actor.role !== "DISPATCHER") {
    throw forbidden("Only the reporting citizen or a dispatcher can attach evidence");
  }

  if (CLOSED_STATUSES.has(incident.status)) {
    throw conflict(
      "INCIDENT_CLOSED",
      "Evidence cannot be attached to a closed, rejected or cancelled incident",
    );
  }
}

export async function addEvidence(
  actor: Actor,
  incidentId: string,
  file: { fileName: string; content: Buffer },
): Promise<EvidenceMeta> {
  if (file.content.length === 0) {
    throw badRequest("EMPTY_EVIDENCE", "The uploaded file is empty");
  }

  if (file.content.length > MAX_EVIDENCE_BYTES) {
    throw badRequest(
      "EVIDENCE_TOO_LARGE",
      `Evidence files must be ${MAX_EVIDENCE_BYTES / (1024 * 1024)} MB or smaller`,
    );
  }

  const mimeType = sniffMimeType(file.content);
  if (!mimeType) {
    throw badRequest(
      "UNSUPPORTED_EVIDENCE_TYPE",
      "Evidence must be a JPEG, PNG or WebP image, or a PDF document",
    );
  }

  const incident = await loadIncidentForViewer(actor, incidentId);
  assertCanManageEvidence(actor, incident);

  const evidence = await prisma.evidence.create({
    data: {
      incidentId: incident.id,
      uploadedById: actor.userId,
      fileName: sanitizeFileName(file.fileName),
      mimeType,
      sizeBytes: file.content.length,
      // Uint8Array.from gives the bytes a dedicated ArrayBuffer, matching the
      // Bytes field's stricter variance in the current Node typings.
      content: Uint8Array.from(file.content),
    },
    select: evidenceSelection,
  });

  await prisma.auditLog.create({
    data: {
      actorId: actor.userId,
      action: "evidence.uploaded",
      entityType: "Incident",
      entityId: incident.id,
      metadata: { evidenceId: evidence.id, fileName: evidence.fileName, sizeBytes: evidence.sizeBytes },
    },
  });

  // Realtime update plus persisted notification. Delivery problems must never
  // undo the committed upload, so failures are logged and swallowed.
  try {
    const payload = {
      incidentId: incident.id,
      referenceNumber: incident.referenceNumber,
      event: "incident.evidence_updated" as const,
      evidence: { id: evidence.id, fileName: evidence.fileName, mimeType: evidence.mimeType },
      at: new Date().toISOString(),
    };

    emitToRole("DISPATCHER", "incident.evidence_updated", payload);
    emitToUser(incident.citizenId, "incident.evidence_updated", payload);

    await notifyEvidenceAdded({
      incident: { id: incident.id, referenceNumber: incident.referenceNumber, citizenId: incident.citizenId },
      uploader: { id: actor.userId, role: actor.role, fullName: evidence.uploadedBy.fullName },
    });
  } catch (error) {
    console.error("Evidence notification failed", error);
  }

  return evidence;
}

export async function listEvidence(actor: Actor, incidentId: string): Promise<EvidenceMeta[]> {
  await loadIncidentForViewer(actor, incidentId);

  return prisma.evidence.findMany({
    where: { incidentId },
    orderBy: { createdAt: "desc" },
    select: evidenceSelection,
  });
}

/**
 * Returns the stored bytes only after the viewer passes the same incident
 * access rule used everywhere else (FR-074).
 */
export async function getEvidenceContent(
  actor: Actor,
  evidenceId: string,
): Promise<{ meta: EvidenceMeta; content: Buffer }> {
  const evidence = await prisma.evidence.findUnique({
    where: { id: evidenceId },
    select: evidenceContentSelection,
  });

  if (!evidence) {
    throw notFound("Evidence not found");
  }

  await loadIncidentForViewer(actor, evidence.incidentId);

  // Buffer.from keeps the exact stored bytes; the view cast satisfies the
  // ArrayBuffer variance introduced by newer Node typings.
  const buffer = Buffer.from(
    evidence.content.buffer as ArrayBuffer,
    evidence.content.byteOffset,
    evidence.content.byteLength,
  );

  return { meta: evidence, content: buffer };
}

export async function deleteEvidence(actor: Actor, evidenceId: string): Promise<void> {
  const evidence = await prisma.evidence.findUnique({
    where: { id: evidenceId },
    select: { id: true, incidentId: true, uploadedById: true, fileName: true },
  });

  if (!evidence) {
    throw notFound("Evidence not found");
  }

  const incident = await loadIncidentForViewer(actor, evidence.incidentId);

  const isUploader = evidence.uploadedById === actor.userId;
  const isDispatcher = actor.role === "DISPATCHER";

  if (!isUploader && !isDispatcher) {
    throw forbidden("Only the uploader or a dispatcher can remove evidence");
  }

  if (CLOSED_STATUSES.has(incident.status)) {
    throw conflict("INCIDENT_CLOSED", "Evidence cannot be removed from a finished incident");
  }

  await prisma.evidence.delete({ where: { id: evidence.id } });

  await prisma.auditLog.create({
    data: {
      actorId: actor.userId,
      action: "evidence.deleted",
      entityType: "Incident",
      entityId: incident.id,
      metadata: { evidenceId: evidence.id, fileName: evidence.fileName },
    },
  });
}
