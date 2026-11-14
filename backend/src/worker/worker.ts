import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { logger } from "../lib/logger.js";
import { prisma } from "../lib/prisma.js";
import {
  notifyEvidenceAdded,
  notifyParticipants,
  type NotificationIncident,
} from "../modules/notifications/notifications.service.js";
import type { IncidentEvent } from "../modules/notifications/notifications.service.js";

/**
 * NFR-054: a durable background worker. Tasks that must not block a user
 * request — or that failed inline and deserve a retry — are stored as
 * `BackgroundJob` rows and processed by the loop below with capped
 * exponential-backoff retries. Delivery problems can therefore never be lost
 * with the request: they survive restarts until they succeed or exhaust their
 * attempts.
 */
export type JobType = "evidence.notify" | "incident.notify";

/** NFR-034: how often the periodic retention sweep runs (default 1 hour). */
const retentionSweepIntervalMs =
  Number(process.env.RETENTION_SWEEP_INTERVAL_HOURS ?? 1) * 3_600_000;

function retentionDays(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * NFR-034: periodic retention maintenance. Only ephemeral, reproducible data
 * is removed automatically — notifications whose alert value has passed and
 * expired authentication sessions. Incident, assignment, evidence, and audit
 * records are never touched by this job (see docs/07-security/
 * data-retention-policy.md); they are the platform's accountability record.
 */
export async function runRetentionSweep(): Promise<{
  notificationsDeleted: number;
  sessionsDeleted: number;
}> {
  const notificationCutoff = new Date(
    Date.now() - retentionDays("RETENTION_NOTIFICATION_DAYS", 90) * 86_400_000,
  );
  const sessionCutoff = new Date(
    Date.now() - retentionDays("RETENTION_SESSION_DAYS", 30) * 86_400_000,
  );

  const notifications = await prisma.notification.deleteMany({
    where: { createdAt: { lt: notificationCutoff } },
  });
  const sessions = await prisma.session.deleteMany({
    where: { expiresAt: { lt: sessionCutoff } },
  });

  if (notifications.count > 0 || sessions.count > 0) {
    logger.info("Retention sweep removed expired ephemeral data", {
      notificationsDeleted: notifications.count,
      sessionsDeleted: sessions.count,
    });
  }

  return { notificationsDeleted: notifications.count, sessionsDeleted: sessions.count };
}

interface JobHandler {
  (payload: unknown): Promise<void>;
}

const baseDelayMs = 2_000;

/** Handlers may throw; the worker converts the throw into a retry. */
const handlers: Record<JobType, JobHandler> = {
  // Retries the evidence notification flow with the original input.
  "evidence.notify": async (payload) => {
    const input = payload as {
      incident: { id: string; referenceNumber: string; citizenId: string };
      uploader: { id: string; role: string; fullName: string };
    };

    // Validate instead of blind-casting so a malformed payload produces a
    // readable lastError instead of a generic deep TypeError.
    if (!input?.incident?.id || !input?.uploader?.id) {
      throw new Error("evidence.notify payload is missing incident or uploader fields");
    }

    await notifyEvidenceAdded(input);
  },

  // Retries the incident notification flow by re-loading the incident.
  "incident.notify": async (payload) => {
    const input = payload as { event: IncidentEvent; incidentId: string };

    if (!input?.incidentId || typeof input.event !== "string") {
      throw new Error("incident.notify payload is missing event or incidentId fields");
    }

    const incident = await prisma.incident.findUnique({
      where: { id: input.incidentId },
      include: { assignments: true, category: true },
    });

    if (!incident) {
      // The incident may have been removed legitimately; treat as done.
      return;
    }

    const notificationIncident: NotificationIncident = {
      id: incident.id,
      referenceNumber: incident.referenceNumber,
      status: incident.status,
      priority: incident.priority,
      citizenId: incident.citizenId,
      category: { name: incident.category.name },
      assignments: incident.assignments.map((assignment) => ({
        responderId: assignment.responderId,
        status: assignment.status,
      })),
    };

    await notifyParticipants({ incident: notificationIncident, event: input.event });
  },
};

/**
 * Enqueues a background job. Best-effort by design: a job-store failure must
 * never undo or fail the caller's committed operation, so errors are logged.
 */
export async function enqueueJob(
  type: JobType,
  payload: unknown,
  options: { maxAttempts?: number } = {},
): Promise<void> {
  try {
    await prisma.backgroundJob.create({
      data: {
        type,
        payload: payload as Prisma.InputJsonValue,
        maxAttempts: options.maxAttempts ?? 5,
      },
    });
  } catch (error) {
    logger.error("Failed to enqueue background job", error, { jobType: type });
  }
}

export interface ProcessedJob {
  id: string;
  type: string;
  outcome: "done" | "retry" | "failed";
}

/**
 * Claims every due PENDING job and processes it sequentially. Returns the
 * outcome per job so tests (and metrics) can inspect what happened.
 */
export async function processDueJobs(): Promise<ProcessedJob[]> {
  const now = new Date();

  const due = await prisma.backgroundJob.findMany({
    where: { status: "PENDING", runAfter: { lte: now } },
    orderBy: { createdAt: "asc" },
    take: 20,
    select: { id: true },
  });

  const processed: ProcessedJob[] = [];

  for (const { id } of due) {
    // The conditional update is the claim: only one worker can move a row from
    // PENDING to PROCESSING, so concurrent workers never double-run a job.
    const claimed = await prisma.backgroundJob.updateMany({
      where: { id, status: "PENDING", runAfter: { lte: now } },
      data: { status: "PROCESSING" },
    });

    if (claimed.count !== 1) {
      continue;
    }

    const job = await prisma.backgroundJob.findUniqueOrThrow({ where: { id } });
    const handler = handlers[job.type as JobType];

    try {
      if (!handler) {
        throw new Error(`No handler for job type ${job.type}`);
      }

      await handler(job.payload);
      await prisma.backgroundJob.update({
        where: { id: job.id },
        data: { status: "DONE", lastError: null },
      });
      processed.push({ id: job.id, type: job.type, outcome: "done" });
    } catch (error) {
      const attempts = job.attempts + 1;
      const exhausted = attempts >= job.maxAttempts;
      const message = error instanceof Error ? error.message : String(error);
      // Exponential backoff: 2s, 4s, 8s… capped at 5 minutes.
      const delayMs = Math.min(baseDelayMs * 2 ** (attempts - 1), 300_000);

      await prisma.backgroundJob.update({
        where: { id: job.id },
        data: {
          status: exhausted ? "FAILED" : "PENDING",
          attempts,
          lastError: message.slice(0, 500),
          runAfter: exhausted ? undefined : new Date(Date.now() + delayMs),
        },
      });

      logger.warn(
        exhausted ? "Background job permanently failed" : "Background job retry scheduled",
        error,
        { jobId: job.id, jobType: job.type, attempts },
      );
      processed.push({ id: job.id, type: job.type, outcome: exhausted ? "failed" : "retry" });
    }
  }

  return processed;
}

/**
 * Starts the polling loop. Returns a stop function so callers (and tests) can
 * shut the worker down cleanly.
 */
export function startWorker(intervalMs = 5_000): () => void {
  const runId = randomUUID();
  logger.info("Background worker started", { runId, intervalMs });

  let lastSweep = 0;

  const timer = setInterval(() => {
    void processDueJobs().catch((error) => {
      logger.error("Background worker tick failed", error);
    });

    // NFR-034: the retention sweep piggybacks on the worker loop at its own,
    // much longer cadence so short polling stays cheap.
    if (Date.now() - lastSweep >= retentionSweepIntervalMs) {
      lastSweep = Date.now();
      void runRetentionSweep().catch((error) => {
        logger.error("Retention sweep failed", error);
      });
    }
  }, intervalMs);

  timer.unref();

  return () => {
    clearInterval(timer);
    logger.info("Background worker stopped", { runId });
  };
}
