import type { Incident, Priority } from "../lib/types";
import { StatusBadge, formatDate } from "./ui";

const priorityStyles: Record<Priority, string> = {
  LOW: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  MEDIUM: "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300",
  HIGH: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  CRITICAL: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
};

const priorityAccent: Record<Priority, string> = {
  LOW: "bg-slate-300 dark:bg-slate-600",
  MEDIUM: "bg-sky-400 dark:bg-sky-500",
  HIGH: "bg-amber-400 dark:bg-amber-500",
  CRITICAL: "bg-rose-500 dark:bg-rose-400",
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide ${priorityStyles[priority]}`}
    >
      {priority}
    </span>
  );
}

export function IncidentListItem({
  incident,
  selected = false,
  onSelect,
}: {
  incident: Incident;
  selected?: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(incident.id)}
      className={`group relative w-full overflow-hidden rounded-xl border p-3.5 pl-4 text-left transition ${
        selected
          ? "border-emerald-400 bg-emerald-50/60 shadow-sm ring-1 ring-emerald-200 dark:border-emerald-500/50 dark:bg-emerald-500/10 dark:ring-emerald-500/30"
          : "border-slate-200 bg-white hover:border-emerald-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:hover:border-emerald-500/40"
      }`}
    >
      <span
        aria-hidden
        className={`absolute inset-y-0 left-0 w-1 ${priorityAccent[incident.priority]}`}
      />

      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] font-medium text-slate-500 dark:text-slate-400">
          {incident.referenceNumber}
        </span>
        <StatusBadge status={incident.status} />
      </div>

      <p className="mt-1.5 line-clamp-2 text-sm font-medium leading-snug text-slate-800 dark:text-slate-200">
        {incident.description}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
        <span className="font-medium text-slate-600 dark:text-slate-400">
          {incident.category.name}
        </span>
        <span aria-hidden className="text-slate-300 dark:text-slate-600">
          ·
        </span>
        <PriorityBadge priority={incident.priority} />
        <span aria-hidden className="text-slate-300 dark:text-slate-600">
          ·
        </span>
        <span>{formatDate(incident.createdAt)}</span>
        {incident.locationDescription && (
          <>
            <span aria-hidden className="text-slate-300 dark:text-slate-600">
              ·
            </span>
            <span className="inline-flex min-w-0 items-center gap-1">
              <svg
                aria-hidden
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-3 w-3 shrink-0"
              >
                <path
                  fillRule="evenodd"
                  d="M10 2.5c-3 0-5.5 2.4-5.5 5.4 0 3.9 4.5 8.6 4.7 8.8a1.1 1.1 0 0 0 1.6 0c.2-.2 4.7-4.9 4.7-8.8 0-3-2.5-5.4-5.5-5.4Zm0 7.6a2.2 2.2 0 1 1 0-4.4 2.2 2.2 0 0 1 0 4.4Z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="truncate">{incident.locationDescription}</span>
            </span>
          </>
        )}
      </div>
    </button>
  );
}
