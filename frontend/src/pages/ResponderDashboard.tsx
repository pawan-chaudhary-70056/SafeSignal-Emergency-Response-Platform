import { useCallback, useEffect, useRef, useState } from "react";
import { DashboardHeader } from "../components/DashboardHeader";
import { IncidentReports } from "../components/IncidentReports";
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
  StatusBadge,
  formatDate,
  inputClass,
} from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { useRealtime } from "../lib/realtime";
import type { Assignment, ResponderProfile, ResponderSelf } from "../lib/types";

type Availability = ResponderProfile["availabilityStatus"];

export function ResponderDashboard() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [me, setMe] = useState<ResponderSelf | null>(null);
  const [availability, setAvailability] = useState<Availability>("AVAILABLE");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [responderType, setResponderType] = useState("");
  const [assignmentFilter, setAssignmentFilter] = useState("");
  const [assignmentSearch, setAssignmentSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const initialised = useRef(false);

  const load = useCallback(async () => {
    const [assignmentResponse, profileResponse] = await Promise.all([
      api<{ assignments: Assignment[] }>("/assignments"),
      api<{ user: ResponderSelf }>("/responders/me"),
    ]);
    setAssignments(assignmentResponse.assignments);
    setMe(profileResponse.user);

    if (!initialised.current) {
      setFullName(profileResponse.user.fullName);
      setPhone(profileResponse.user.phone ?? "");
      setResponderType(profileResponse.user.responderProfile?.responderType ?? "GENERAL");
      setAvailability(profileResponse.user.responderProfile?.availabilityStatus ?? "AVAILABLE");
      initialised.current = true;
    }
  }, []);

  useEffect(() => {
    load().catch((caught) => setError(errorMessage(caught)));
  }, [load]);

  const { connected, lastEvent } = useRealtime(() => {
    void load();
  });

  async function runAction(action: () => Promise<string>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const message = await action();
      setNotice(message);
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function saveAvailability() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api("/responders/me/availability", {
        method: "PATCH",
        body: JSON.stringify({ availabilityStatus: availability }),
      });
      setNotice(`Availability set to ${availability}. Dispatch sees this immediately.`);
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await api<{ user: ResponderSelf }>("/responders/me", {
        method: "PATCH",
        body: JSON.stringify({
          fullName: fullName.trim(),
          phone: phone.trim() ? phone.trim() : null,
          ...(responderType.trim() ? { responderType: responderType.trim() } : {}),
        }),
      });
      setMe(response.user);
      setFullName(response.user.fullName);
      setPhone(response.user.phone ?? "");
      setResponderType(response.user.responderProfile?.responderType ?? responderType);
      setAvailability(response.user.responderProfile?.availabilityStatus ?? availability);
      setNotice("Profile updated.");
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  const visibleAssignments = assignments.filter((assignment) => {
    if (assignmentFilter && assignment.status !== assignmentFilter) {
      return false;
    }

    const query = assignmentSearch.trim().toLowerCase();
    if (!query) return true;

    return [
      assignment.incident.referenceNumber,
      assignment.incident.description,
      assignment.incident.category.name,
      assignment.incident.locationDescription ?? "",
    ].some((value) => value.toLowerCase().includes(query));
  });

  const availabilityBadge =
    availability === "AVAILABLE"
      ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-200 dark:ring-emerald-500/30"
      : availability === "BUSY"
        ? "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-200 dark:ring-amber-500/30"
        : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 ring-slate-200 dark:ring-slate-700";

  return (
    <div className="space-y-6">
      <DashboardHeader role="RESPONDER" />

      {error && <Alert tone="error" message={error} />}
      {notice && <Alert tone="success" message={notice} />}
      {lastEvent && <Alert tone="success" message={lastEvent} />}

      <Card
        title="My profile"
        subtitle="Dispatch filters responders by availability, so keep it current."
        action={<LiveBadge connected={connected} />}
      >
        <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-slate-50 dark:bg-slate-950 p-4">
          <Avatar name={me?.fullName ?? "Responder"} className="h-12 w-12 text-sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              {me?.fullName ?? "Loading profile…"}
            </p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{me?.email ?? ""}</p>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${availabilityBadge}`}
          >
            {availability}
          </span>
          <span className="rounded-full bg-white dark:bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:text-slate-400 ring-1 ring-inset ring-slate-200 dark:ring-slate-700">
            {responderType || "GENERAL"}
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Availability" hint="Only AVAILABLE responders receive new assignments.">
            <select
              className={inputClass}
              value={availability}
              onChange={(event) => setAvailability(event.target.value as Availability)}
              disabled={busy || !me}
            >
              <option value="AVAILABLE">AVAILABLE</option>
              <option value="BUSY">BUSY</option>
              <option value="UNAVAILABLE">UNAVAILABLE</option>
            </select>
          </Field>

          <Field label="Responder type" hint="For example: AMBULANCE, FIRE, RESCUE.">
            <input
              className={inputClass}
              value={responderType}
              onChange={(event) => setResponderType(event.target.value)}
              placeholder="AMBULANCE"
              maxLength={80}
              disabled={busy || !me}
            />
          </Field>

          <Field label="Full name">
            <input
              className={inputClass}
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              maxLength={120}
              disabled={busy || !me}
            />
          </Field>

          <Field label="Phone" hint="Optional. Leave empty to clear the stored number.">
            <input
              className={inputClass}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+9779800000000"
              maxLength={30}
              disabled={busy || !me}
            />
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button disabled={busy || !me} onClick={() => void saveAvailability()}>
            Save availability
          </Button>
          <Button
            variant="secondary"
            disabled={busy || !me || fullName.trim().length < 2}
            onClick={() => void saveProfile()}
          >
            Save profile
          </Button>
        </div>
      </Card>

      <Card
        title="My assignments"
        subtitle="Accept an assignment first, then report each response stage as it happens."
        action={
          <Button variant="ghost" onClick={() => void load()}>
            Refresh
          </Button>
        }
      >
        <ListFilters
          search={assignmentSearch}
          onSearchChange={setAssignmentSearch}
          searchPlaceholder="Search incident, category or location"
          status={assignmentFilter}
          statusOptions={[
            { label: "All", value: "" },
            { label: "Pending", value: "PENDING" },
            { label: "Accepted", value: "ACCEPTED" },
            { label: "Completed", value: "COMPLETED" },
            { label: "Rejected", value: "REJECTED" },
          ]}
          onStatusChange={setAssignmentFilter}
          resultSummary={`${visibleAssignments.length} of ${assignments.length} assignments`}
        />

        <div className="space-y-3">
          {assignments.length === 0 ? (
            <EmptyState message="No assignments yet. Stay AVAILABLE so dispatch can reach you." />
          ) : visibleAssignments.length === 0 ? (
            <EmptyState message="No assignments match these filters." />
          ) : (
            visibleAssignments.map((assignment) => (
              <AssignmentCard
                key={assignment.id}
                assignment={assignment}
                busy={busy}
                runAction={runAction}
              />
            ))
          )}
        </div>
      </Card>

      <LiveIncidentMap />
      <IncidentReports />
    </div>
  );
}

function AssignmentCard({
  assignment,
  busy,
  runAction,
}: {
  assignment: Assignment;
  busy: boolean;
  runAction: (action: () => Promise<string>) => Promise<void>;
}) {
  const [rejectReason, setRejectReason] = useState("");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const incident = assignment.incident;

  const progressButton = (() => {
    if (assignment.status !== "ACCEPTED") return null;

    switch (incident.status) {
      case "ACCEPTED":
        return { label: "Start en route", path: "en-route", next: "EN_ROUTE" };
      case "EN_ROUTE":
        return { label: "Mark arrived", path: "arrived", next: "ARRIVED" };
      case "ARRIVED":
        return { label: "Assistance in progress", path: "in-progress", next: "IN_PROGRESS" };
      default:
        return null;
    }
  })();

  const accent =
    assignment.status === "PENDING"
      ? "border-l-amber-400"
      : assignment.status === "COMPLETED"
        ? "border-l-emerald-500"
        : assignment.status === "REJECTED"
          ? "border-l-rose-400"
          : "border-l-sky-400";

  return (
    <article className={`rounded-xl border border-slate-200 dark:border-slate-800 border-l-4 bg-white dark:bg-slate-900 p-4 ${accent}`}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-mono text-[11px] font-medium text-slate-500 dark:text-slate-400">
            {incident.referenceNumber}
          </p>
          <h3 className="mt-0.5 text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            {incident.category.name}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:text-slate-400">
            {assignment.status}
          </span>
          <StatusBadge status={incident.status} />
        </div>
      </header>

      <p className="mt-2 text-sm leading-relaxed text-slate-700 dark:text-slate-300">{incident.description}</p>

      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <div className="rounded-lg bg-slate-50 dark:bg-slate-950 px-3 py-2">
          <dt className="font-semibold text-slate-500 dark:text-slate-400">Priority</dt>
          <dd className="mt-0.5 font-medium text-slate-800 dark:text-slate-200">{incident.priority}</dd>
        </div>
        <div className="rounded-lg bg-slate-50 dark:bg-slate-950 px-3 py-2">
          <dt className="font-semibold text-slate-500 dark:text-slate-400">Assigned</dt>
          <dd className="mt-0.5 font-medium text-slate-800 dark:text-slate-200">{formatDate(assignment.assignedAt)}</dd>
        </div>
        <div className="rounded-lg bg-slate-50 dark:bg-slate-950 px-3 py-2">
          <dt className="font-semibold text-slate-500 dark:text-slate-400">Contact</dt>
          <dd className="mt-0.5 font-medium text-slate-800 dark:text-slate-200">
            {incident.contactInformation ?? "Not provided"}
          </dd>
        </div>
        <div className="rounded-lg bg-slate-50 dark:bg-slate-950 px-3 py-2">
          <dt className="font-semibold text-slate-500 dark:text-slate-400">Location</dt>
          <dd className="mt-0.5 font-medium text-slate-800 dark:text-slate-200">
            {incident.latitude !== null && incident.longitude !== null
              ? `${incident.latitude.toFixed(4)}, ${incident.longitude.toFixed(4)}`
              : (incident.locationDescription ?? "Not provided")}
          </dd>
        </div>
      </dl>

      {assignment.assignmentNote && (
        <p className="mt-3 rounded-lg border border-sky-100 dark:border-sky-500/30 bg-sky-50 dark:bg-sky-500/10 px-3 py-2 text-xs leading-relaxed text-sky-800 dark:text-sky-300">
          Dispatch note: {assignment.assignmentNote}
        </p>
      )}

      {assignment.status === "PENDING" && (
        <div className="mt-4 space-y-3 border-t border-slate-100 dark:border-slate-800 pt-4">
          <Button
            disabled={busy}
            onClick={() =>
              void runAction(async () => {
                await api(`/assignments/${assignment.id}/accept`, { method: "POST" });
                return "Assignment accepted. You can now update response progress.";
              })
            }
          >
            Accept assignment
          </Button>

          <div className="space-y-2">
            <Field label="Rejection reason">
              <input
                className={inputClass}
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                placeholder="Currently responding to another incident"
              />
            </Field>
            <Button
              variant="danger"
              disabled={busy || rejectReason.trim().length < 3}
              onClick={() =>
                void runAction(async () => {
                  await api(`/assignments/${assignment.id}/reject`, {
                    method: "POST",
                    body: JSON.stringify({ reason: rejectReason.trim() }),
                  });
                  return "Assignment rejected. Dispatch has been notified in history.";
                })
              }
            >
              Reject assignment
            </Button>
          </div>
        </div>
      )}

      {progressButton && (
        <div className="mt-4 border-t border-slate-100 dark:border-slate-800 pt-4">
          <Button
            disabled={busy}
            onClick={() =>
              void runAction(async () => {
                await api(`/assignments/${assignment.id}/${progressButton.path}`, {
                  method: "POST",
                });
                return `Response updated to ${progressButton.next}.`;
              })
            }
          >
            {progressButton.label}
          </Button>
        </div>
      )}

      {assignment.status === "ACCEPTED" && incident.status === "IN_PROGRESS" && (
        <div className="mt-4 space-y-2 border-t border-slate-100 dark:border-slate-800 pt-4">
          <Field label="Resolution notes" hint="Required before the incident can be resolved.">
            <textarea
              className={`${inputClass} min-h-20`}
              value={resolutionNotes}
              onChange={(event) => setResolutionNotes(event.target.value)}
              placeholder="Casualty handed over to hospital staff."
            />
          </Field>
          <Button
            disabled={busy || resolutionNotes.trim().length < 3}
            onClick={() =>
              void runAction(async () => {
                await api(`/assignments/${assignment.id}/resolved`, {
                  method: "POST",
                  body: JSON.stringify({ resolutionNotes: resolutionNotes.trim() }),
                });
                return "Incident resolved. Dispatch can now close it.";
              })
            }
          >
            Mark resolved
          </Button>
        </div>
      )}

      {assignment.status === "COMPLETED" && (
        <p className="mt-3 rounded-lg border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">
          Response completed. Dispatcher will review and close the incident.
        </p>
      )}

      {assignment.rejectionReason && (
        <p className="mt-3 rounded-lg border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-700 dark:text-rose-300">
          Rejected: {assignment.rejectionReason}
        </p>
      )}
    </article>
  );
}
