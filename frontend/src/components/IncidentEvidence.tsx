import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage } from "../lib/api";
import { useRealtime } from "../lib/realtime";
import type { Evidence, Incident } from "../lib/types";
import { Alert, Button, formatDate } from "./ui";
/**
 * Evidence panel for one incident (FR-072–FR-074). Files are validated on the
 * client for quick feedback and re-validated on the server by content.
 */
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_BYTES = 5 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} kB`;
  }
  return `${bytes} B`;
}

function typeLabel(mimeType: string): string {
  if (mimeType.startsWith("image/")) {
    return mimeType.replace("image/", "").toUpperCase();
  }
  if (mimeType === "application/pdf") {
    return "PDF";
  }
  return "FILE";
}

interface IncidentEvidenceProps {
  incident: Incident;
  /** Citizens can attach to their own reports; dispatchers to any active one. */
  canUpload: boolean;
  /** The uploader can remove their own files; dispatchers any of them. */
  canDelete: boolean;
}

export function IncidentEvidence({ incident, canUpload, canDelete }: IncidentEvidenceProps) {
  const [evidence, setEvidence] = useState<Evidence[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const response = await api<{ evidence: Evidence[] }>(`/incidents/${incident.id}/evidence`);
      setEvidence(response.evidence);
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
      setEvidence([]);
    }
  }, [incident.id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Any incident event for this signed-in user refreshes the list without a
  // manual reload, matching the realtime pattern used by the live map.
  useRealtime(() => {
    void load();
  });

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    setError(null);
    setNotice(null);

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError("Supported evidence: JPEG, PNG, WebP images or PDF documents.");
      return;
    }

    if (file.size > MAX_BYTES) {
      setError("Evidence files must be 5 MB or smaller.");
      return;
    }

    setUploading(true);
    try {
      const response = await api<{ evidence: Evidence }>(`/incidents/${incident.id}/evidence`, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "x-file-name": encodeURIComponent(file.name),
        },
        body: file,
      });

      setEvidence((current) => [response.evidence, ...(current ?? [])]);
      setNotice(`Attached “${response.evidence.fileName}”.`);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(item: Evidence) {
    setError(null);
    setNotice(null);
    try {
      await api(`/evidence/${item.id}`, { method: "DELETE" });
      setEvidence((current) => (current ?? []).filter((entry) => entry.id !== item.id));
      setNotice(`Removed “${item.fileName}”.`);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  return (
    <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Evidence
        </h3>
        {canUpload && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES.join(",")}
              className="sr-only"
              onChange={(event) => void handleUpload(event)}
              disabled={uploading}
              aria-label="Attach evidence file"
            />
            <Button
              type="button"
              variant="ghost"
              disabled={uploading}
              className="px-3 py-1.5 text-xs"
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? "Uploading…" : "Attach file"}
            </Button>
          </>
        )}
      </div>

      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        JPEG, PNG, WebP or PDF · up to 5 MB · stored privately and shared only with the response
        team.
      </p>

      {notice && (
        <div className="mt-2">
          <Alert tone="success" message={notice} />
        </div>
      )}
      {error && (
        <div className="mt-2">
          <Alert tone="error" message={error} />
        </div>
      )}

      {evidence === null ? (
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Loading evidence…</p>
      ) : evidence.length === 0 ? (
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">No evidence attached yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {evidence.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2.5"
            >
              <span className="inline-flex h-8 shrink-0 items-center rounded-lg bg-slate-100 px-2 text-[10px] font-bold tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {typeLabel(item.mimeType)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                  {item.fileName}
                </p>
                <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                  {formatBytes(item.sizeBytes)} · {formatDate(item.createdAt)} ·{" "}
                  {item.uploadedBy.fullName}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <a
                  href={`/api/v1/evidence/${item.id}`}
                  download={item.fileName}
                  className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-400/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Download
                </a>
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => void handleDelete(item)}
                    className="inline-flex items-center rounded-xl border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-rose-700 shadow-sm transition hover:bg-rose-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-rose-400/30 dark:border-rose-900/60 dark:bg-slate-900 dark:text-rose-300 dark:hover:bg-rose-950/40"
                  >
                    Remove
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
