import { useCallback, useEffect, useState } from "react";
import { DashboardHeader } from "../components/DashboardHeader";
import { IncidentListItem } from "../components/IncidentList";
import { IncidentReports } from "../components/IncidentReports";
import { IncidentSummary } from "../components/IncidentSummary";
import { ListFilters } from "../components/ListFilters";
import { LiveIncidentMap } from "../components/LiveIncidentMap";
import {
  Alert,
  Avatar,
  Button,
  Card,
  EmptyState,
  Field,
  LiveBadge,
  PaginationControls,
  StatusBadge,
  formatDate,
  inputClass,
} from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { useRealtime } from "../lib/realtime";
import type {
  HistoryEntry,
  Incident,
  IncidentStatus,
  Pagination,
  Priority,
  ResponderOption,
} from "../lib/types";

const PAGE_SIZE = 10;

const filters: Array<{ label: string; value: "" | IncidentStatus }> = [
  { label: "All", value: "" },
  { label: "Submitted", value: "SUBMITTED" },
  { label: "Under review", value: "UNDER_REVIEW" },
  { label: "Verified", value: "VERIFIED" },
  { label: "Assigned", value: "ASSIGNED" },
  { label: "Accepted", value: "ACCEPTED" },
  { label: "Resolved", value: "RESOLVED" },
  { label: "Closed", value: "CLOSED" },
  { label: "Rejected", value: "REJECTED" },
];

export function DispatcherDashboard() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [responders, setResponders] = useState<ResponderOption[]>([]);
  const [filter, setFilter] = useState<"" | IncidentStatus>("");
  const [priority, setPriority] = useState<"" | Priority>("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Incident | null>(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [rejectReason, setRejectReason] = useState("");
  const [assignNote, setAssignNote] = useState("");
  const [responderId, setResponderId] = useState("");
  const [reassignReason, setReassignReason] = useState("");
  const [reassignResponderId, setReassignResponderId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const query = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (filter) query.set("status", filter);
    if (priority) query.set("priority", priority);
    if (search) query.set("search", search);

    const [incidentResponse, responderResponse] = await Promise.all([
      api<{ incidents: Incident[]; pagination: Pagination }>(`/incidents?${query.toString()}`),
      api<{ responders: ResponderOption[] }>("/responders?availability=AVAILABLE"),
    ]);
    setIncidents(incidentResponse.incidents);
    setPagination(incidentResponse.pagination);
    setResponders(responderResponse.responders);
    setResponderId(responderResponse.responders[0]?.id ?? "");

    if (page > incidentResponse.pagination.totalPages) {
      setPage(Math.max(1, incidentResponse.pagination.totalPages));
    }
  }, [filter, page, priority, search]);

  useEffect(() => {
    load().catch((caught) => setError(errorMessage(caught)));
  }, [load]);

  const refreshSelected = useCallback(async (id: string) => {
    const [detail, historyResponse] = await Promise.all([
      api<{ incident: Incident }>(`/incidents/${id}`),
      api<{ history: HistoryEntry[] }>(`/incidents/${id}/history`),
    ]);
    setSelected(detail.incident);
    setHistory(historyResponse.history);
  }, []);

  const openIncident = useCallback(
    async (id: string) => {
      setSelectedId(id);
      setRejectReason("");
      setReassignReason("");
      setReassignResponderId("");
      setNotice(null);
      await refreshSelected(id);
    },
    [refreshSelected],
  );

  const { connected, lastEvent } = useRealtime(() => {
    void load();
    if (selectedId) {
      void refreshSelected(selectedId).catch(() => undefined);
    }
  });

  useEffect(() => {
    if (selected?.status === "VERIFIED" && !responderId && responders[0]) {
      setResponderId(responders[0].id);
    }
  }, [selected, responderId, responders]);

  async function runAction(action: () => Promise<string>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const message = await action();
      setNotice(message);
      await load();
      if (selectedId) {
        await refreshSelected(selectedId);
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  const activeAssignment =
    selected?.assignments?.find(
      (assignment) => assignment.status === "PENDING" || assignment.status === "ACCEPTED",
    ) ?? null;
  const reassignOptions = activeAssignment
    ? responders.filter((responder) => responder.id !== activeAssignment.responderId)
    : [];
  const reassignTargetId = reassignOptions.some((option) => option.id === reassignResponderId)
    ? reassignResponderId
    : (reassignOptions[0]?.id ?? "");
  const reassignAssignmentId = activeAssignment?.id ?? "";
  const currentResponder = activeAssignment
    ? responders.find((responder) => responder.id === activeAssignment.responderId)
    : undefined;

  return (
    <div className="space-y-6">
      <DashboardHeader role="DISPATCHER" />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
      <Card
        title="Incident queue"
        subtitle="Review submitted reports, verify them, and move them into dispatch."
        action={
          <div className="flex items-center gap-2">
            <LiveBadge connected={connected} />
            <Button variant="ghost" onClick={() => void load()}>
              Refresh
            </Button>
          </div>
        }
      >
        <ListFilters
          search={search}
          onSearchChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          status={filter}
          statusOptions={filters}
          onStatusChange={(value) => {
            setFilter(value as "" | IncidentStatus);
            setPage(1);
          }}
          priority={priority}
          priorityOptions={[
            { label: "All priorities", value: "" },
            { label: "Low", value: "LOW" },
            { label: "Medium", value: "MEDIUM" },
            { label: "High", value: "HIGH" },
            { label: "Critical", value: "CRITICAL" },
          ]}
          onPriorityChange={(value) => {
            setPriority(value as "" | Priority);
            setPage(1);
          }}
          resultSummary={
            pagination
              ? `${pagination.totalItems} incident${pagination.totalItems === 1 ? "" : "s"}`
              : undefined
          }
        />

        {error && (
          <div className="mb-3">
            <Alert tone="error" message={error} />
          </div>
        )}
        {notice && (
          <div className="mb-3">
            <Alert tone="success" message={notice} />
          </div>
        )}
        {lastEvent && (
          <div className="mb-3">
            <Alert tone="success" message={lastEvent} />
          </div>
        )}

        {incidents.length === 0 ? (
          <EmptyState message="No incidents match these filters." />
        ) : (
          <ul className="space-y-2.5">
            {incidents.map((incident) => (
              <li key={incident.id}>
                <IncidentListItem
                  incident={incident}
                  selected={selectedId === incident.id}
                  onSelect={(id) => void openIncident(id)}
                />
              </li>
            ))}
          </ul>
        )}

        {pagination && <PaginationControls pagination={pagination} onChange={setPage} />}
      </Card>

      <div className="space-y-6">
        {selected ? (
          <Card
            title={`Incident ${selected.referenceNumber}`}
            subtitle={`${selected.category.name} · reported ${formatDate(selected.createdAt)}`}
            action={<StatusBadge status={selected.status} />}
          >
            <div className="space-y-4 text-sm">
              <IncidentSummary incident={selected} showAssignmentCount />

              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <Field label="Priority">
                  <select
                    className={inputClass}
                    value={selected.priority}
                    onChange={(event) =>
                      void runAction(async () => {
                        await api(`/incidents/${selected.id}/priority`, {
                          method: "PATCH",
                          body: JSON.stringify({ priority: event.target.value as Priority }),
                        });
                        return "Priority updated.";
                      })
                    }
                    disabled={busy || ["CLOSED", "REJECTED", "CANCELLED"].includes(selected.status)}
                  >
                    {(["LOW", "MEDIUM", "HIGH", "CRITICAL"] as Priority[]).map((priority) => (
                      <option key={priority} value={priority}>
                        {priority}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              {selected.status === "SUBMITTED" && (
                <Button
                  disabled={busy}
                  className="w-full"
                  onClick={() =>
                    void runAction(async () => {
                      await api(`/incidents/${selected.id}/review`, { method: "POST" });
                      return "Incident moved to UNDER_REVIEW.";
                    })
                  }
                >
                  Start review
                </Button>
              )}

              {selected.status === "UNDER_REVIEW" && (
                <div className="space-y-3 rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-amber-50/50 dark:bg-amber-500/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                    Verification
                  </p>
                  <Button
                    disabled={busy}
                    className="w-full"
                    onClick={() =>
                      void runAction(async () => {
                        await api(`/incidents/${selected.id}/verify`, { method: "POST" });
                        return "Incident verified and ready for assignment.";
                      })
                    }
                  >
                    Verify incident
                  </Button>

                  <div className="space-y-2 border-t border-amber-200/70 pt-3">
                    <Field label="Rejection reason">
                      <input
                        className={inputClass}
                        value={rejectReason}
                        onChange={(event) => setRejectReason(event.target.value)}
                        placeholder="Duplicate report, no emergency confirmed"
                      />
                    </Field>
                    <Button
                      variant="danger"
                      disabled={busy || rejectReason.trim().length < 3}
                      onClick={() =>
                        void runAction(async () => {
                          await api(`/incidents/${selected.id}/reject`, {
                            method: "POST",
                            body: JSON.stringify({ reason: rejectReason.trim() }),
                          });
                          return "Incident rejected.";
                        })
                      }
                    >
                      Reject report
                    </Button>
                  </div>
                </div>
              )}

              {selected.status === "VERIFIED" && (
                <div className="space-y-3 rounded-2xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-500/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                    Dispatch
                  </p>
                  <Field
                    label="Assign responder"
                    hint={
                      responders.length === 0
                        ? "No responder is currently AVAILABLE."
                        : "Only responders marked AVAILABLE can be assigned."
                    }
                  >
                    <select
                      className={inputClass}
                      value={responderId}
                      onChange={(event) => setResponderId(event.target.value)}
                      disabled={responders.length === 0}
                    >
                      {responders.map((responder) => (
                        <option key={responder.id} value={responder.id}>
                          {responder.fullName} (
                          {responder.responderProfile?.responderType ?? "responder"})
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Dispatch note (optional)">
                    <input
                      className={inputClass}
                      value={assignNote}
                      onChange={(event) => setAssignNote(event.target.value)}
                      placeholder="Nearest available unit"
                    />
                  </Field>
                  <Button
                    disabled={busy || !responderId}
                    className="w-full"
                    onClick={() =>
                      void runAction(async () => {
                        await api("/assignments", {
                          method: "POST",
                          body: JSON.stringify({
                            incidentId: selected.id,
                            responderId,
                            ...(assignNote.trim() ? { note: assignNote.trim() } : {}),
                          }),
                        });
                        return "Responder assigned. Waiting for acceptance.";
                      })
                    }
                  >
                    Assign responder
                  </Button>
                </div>
              )}

              {selected.status === "RESOLVED" && (
                <Button
                  variant="secondary"
                  className="w-full"
                  disabled={busy}
                  onClick={() =>
                    void runAction(async () => {
                      await api(`/incidents/${selected.id}/close`, { method: "POST" });
                      return "Incident closed and recorded in history.";
                    })
                  }
                >
                  Review and close incident
                </Button>
              )}

              {activeAssignment && (
                <div className="space-y-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 p-4">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Reassign this incident
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                      Current assignment: {currentResponder?.fullName ?? "another responder"} (
                      {activeAssignment.status}). The previous assignment is kept in history.
                    </p>
                  </div>

                  <Field
                    label="Reassign to"
                    hint={
                      reassignOptions.length === 0
                        ? "No other responder is currently AVAILABLE."
                        : "Only responders marked AVAILABLE can be selected."
                    }
                  >
                    <select
                      className={inputClass}
                      value={reassignTargetId}
                      onChange={(event) => setReassignResponderId(event.target.value)}
                      disabled={reassignOptions.length === 0}
                    >
                      {reassignOptions.map((responder) => (
                        <option key={responder.id} value={responder.id}>
                          {responder.fullName} (
                          {responder.responderProfile?.responderType ?? "responder"})
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Reassignment reason">
                    <input
                      className={inputClass}
                      value={reassignReason}
                      onChange={(event) => setReassignReason(event.target.value)}
                      placeholder="Nearest unit is needed on another incident"
                    />
                  </Field>

                  <Button
                    variant="secondary"
                    className="w-full"
                    disabled={busy || !reassignTargetId || reassignReason.trim().length < 3}
                    onClick={() =>
                      void runAction(async () => {
                        await api(`/assignments/${reassignAssignmentId}/reassign`, {
                          method: "POST",
                          body: JSON.stringify({
                            responderId: reassignTargetId,
                            reason: reassignReason.trim(),
                          }),
                        });
                        setReassignReason("");
                        return "Incident reassigned. The new responder can now accept it.";
                      })
                    }
                  >
                    Reassign responder
                  </Button>
                </div>
              )}

              {selected.assignments && selected.assignments.length > 0 && (
                <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Assignments
                  </h3>
                  <ul className="mt-2 space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                    {selected.assignments.map((assignment) => (
                      <li
                        key={assignment.id}
                        className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 dark:bg-slate-950 px-3 py-2"
                      >
                        <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                          {assignment.id.slice(0, 8)}
                        </span>
                        <span className="font-semibold text-slate-700 dark:text-slate-300">{assignment.status}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {history.length > 0 && (
                <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Status history
                  </h3>
                  <ol className="mt-3 space-y-3 border-l border-slate-200 dark:border-slate-800 pl-4">
                    {history.map((entry) => (
                      <li key={entry.id} className="relative">
                        <span
                          aria-hidden
                          className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-slate-400 ring-4 ring-slate-100 dark:ring-slate-800"
                        />
                        <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                          {entry.previousStatus ? `${entry.previousStatus} → ` : ""}
                          {entry.newStatus}
                        </p>
                        {entry.reason && (
                          <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                            {entry.reason}
                          </p>
                        )}
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">{formatDate(entry.createdAt)}</p>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          </Card>
        ) : (
          <Card title="Incident details">
            <EmptyState message="Select an incident from the queue to review it." />
          </Card>
        )}

        <Card title="Available responders" subtitle="Updated after each refresh.">
          {responders.length === 0 ? (
            <EmptyState message="No responders are currently available." />
          ) : (
            <ul className="space-y-2">
              {responders.map((responder) => (
                <li
                  key={responder.id}
                  className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2.5"
                >
                  <Avatar name={responder.fullName} className="h-9 w-9" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-200">
                      {responder.fullName}
                    </p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">{responder.email}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-200 dark:ring-emerald-500/30">
                    {responder.responderProfile?.availabilityStatus ?? "AVAILABLE"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      </div>
      <LiveIncidentMap />
      <IncidentReports />
    </div>
  );
}
