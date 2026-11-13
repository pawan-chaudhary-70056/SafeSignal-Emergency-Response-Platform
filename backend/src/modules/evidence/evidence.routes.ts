import { Router } from "express";
import express from "express";
import { asyncHandler, actorFrom } from "../../lib/http.js";
import { pathParam } from "../../lib/params.js";
import { authenticate, requireRole } from "../../middleware/auth.js";
import {
  MAX_EVIDENCE_BYTES,
  addEvidence,
  deleteEvidence,
  getEvidenceContent,
  listEvidence,
} from "./evidence.service.js";

// Mounted under /api/v1/incidents so the raw upload bypasses the global 100 kB
// JSON parser: multipart parsing would need another dependency, and raw bytes
// with metadata headers keep the request small and dependency-free.
export const incidentEvidenceRouter = Router();

incidentEvidenceRouter.use(authenticate);

incidentEvidenceRouter.post(
  "/:id/evidence",
  requireRole("CITIZEN", "DISPATCHER"),
  express.raw({ type: "application/octet-stream", limit: MAX_EVIDENCE_BYTES + 1 }),
  asyncHandler(async (req, res) => {
    const actor = actorFrom(req);
    const incidentId = pathParam(req, "id");

    const rawName = req.get("x-file-name");
    if (!rawName || rawName.trim().length === 0) {
      res.status(400).json({
        error: { code: "FILE_NAME_REQUIRED", message: "The x-file-name header is required" },
      });
      return;
    }

    const evidence = await addEvidence(actor, incidentId, {
      fileName: rawName,
      content: Buffer.from(req.body as Buffer),
    });

    res.status(201).json({ evidence });
  }),
);

incidentEvidenceRouter.get(
  "/:id/evidence",
  asyncHandler(async (req, res) => {
    const actor = actorFrom(req);
    const evidence = await listEvidence(actor, pathParam(req, "id"));
    res.json({ evidence });
  }),
);

// Mounted under /api/v1/evidence for reading and removing stored files.
export const evidenceRouter = Router();

evidenceRouter.use(authenticate);

evidenceRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const actor = actorFrom(req);
    const { meta, content } = await getEvidenceContent(actor, pathParam(req, "id"));

    res.setHeader("Content-Type", meta.mimeType);
    res.setHeader("Content-Length", content.length);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(meta.fileName)}`,
    );
    // Evidence is private: never cached, never sniffed into another type.
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.status(200).end(content);
  }),
);

evidenceRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const actor = actorFrom(req);
    await deleteEvidence(actor, pathParam(req, "id"));
    res.status(204).end();
  }),
);
