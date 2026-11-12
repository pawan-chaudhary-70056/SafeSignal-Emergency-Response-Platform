import type { Incident } from "../lib/types";
import { PriorityBadge } from "./IncidentList";

export function IncidentSummary({
  incident,
  showAssignmentCount = false,
}: {
  incident: Incident;
  showAssignmentCount?: boolean;
}) {
  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Priority
          </span>
          <PriorityBadge priority={incident.priority} />
        </div>
        {showAssignmentCount && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {incident.assignments?.length ?? 0} assignment
            {(incident.assignments?.length ?? 0) === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <p className="rounded-xl bg-slate-50 p-3.5 leading-relaxed text-slate-700 dark:bg-slate-950 dark:text-slate-300">
        {incident.description}
      </p>

      <dl className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Contact
          </dt>
          <dd className="mt-1 font-medium text-slate-800 dark:text-slate-200">
            {incident.contactInformation ?? "Not provided"}
          </dd>
        </div>
        <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Coordinates
          </dt>
          <dd className="mt-1 font-medium text-slate-800 dark:text-slate-200">
            {incident.latitude !== null && incident.longitude !== null
              ? `${incident.latitude.toFixed(4)}, ${incident.longitude.toFixed(4)}`
              : "Not provided"}
          </dd>
        </div>
        <div className="rounded-xl border border-slate-200 p-3 sm:col-span-2 dark:border-slate-800">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Location description
          </dt>
          <dd className="mt-1 font-medium text-slate-800 dark:text-slate-200">
            {incident.locationDescription ?? "Not provided"}
          </dd>
        </div>
      </dl>
    </div>
  );
}
