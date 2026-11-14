import { useEffect, useState } from "react";
import { api, errorMessage } from "../lib/api";
import { useRealtime } from "../lib/realtime";
import type { IncidentStats, Priority } from "../lib/types";
import { Alert, Button, Card, EmptyState, StatCard, StatusBadge, formatDate } from "./ui";

const priorityColor: Record<Priority, string> = {
  LOW: "bg-slate-400",
  MEDIUM: "bg-sky-500",
  HIGH: "bg-amber-500",
  CRITICAL: "bg-rose-500",
};

function formatDuration(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  return `${(minutes / 60).toFixed(1)} h`;
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function IncidentReports({ id = "incident-reports" }: { id?: string } = {}) {
  const [stats, setStats] = useState<IncidentStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  useRealtime(() => setReloadKey((key) => key + 1));

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response = await api<{ stats: IncidentStats }>("/incidents/stats");
        if (!active) return;
        setStats(response.stats);
        setError(null);
      } catch (caught) {
        if (active) setError(errorMessage(caught));
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [reloadKey]);

  function downloadCsv() {
    if (!stats) return;

    const rows: string[][] = [
      ["SafeSignal incident report"],
      ["Generated at", new Date().toISOString()],
      [],
      ["Summary"],
      ["Total incidents", String(stats.total)],
      ["Active", String(stats.active)],
      ["Resolved (awaiting close)", String(stats.resolved)],
      ["Closed", String(stats.closed)],
      ["Rejected", String(stats.rejected)],
      ["Cancelled", String(stats.cancelled)],
      ["Average resolution", formatDuration(stats.averageResolutionMinutes)],
      [],
      ["Status", "Count"],
      ...stats.byStatus.map((row) => [row.status, String(row.count)]),
      [],
      ["Priority", "Count"],
      ...stats.byPriority.map((row) => [row.priority, String(row.count)]),
      [],
      ["Category", "Count"],
      ...stats.byCategory.map((row) => [row.name, String(row.count)]),
      [],
      ["Recent incidents"],
      ["Reference", "Category", "Status", "Priority", "Created at", "Resolved at"],
      ...stats.recent.map((incident) => [
        incident.referenceNumber,
        incident.category.name,
        incident.status,
        incident.priority,
        incident.createdAt,
        incident.resolvedAt ?? "",
      ]),
    ];

    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `safesignal-report-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const maxStatus = Math.max(1, ...(stats?.byStatus.map((row) => row.count) ?? [0]));
  const maxPriority = Math.max(1, ...(stats?.byPriority.map((row) => row.count) ?? [0]));

  return (
    <Card
      id={id}
      title="Incident reports"
      subtitle="Role-scoped statistics, resolution time and a downloadable report."
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            disabled={loading}
            onClick={() => {
              setLoading(true);
              setReloadKey((key) => key + 1);
            }}
          >
            Reload report
          </Button>
          <Button variant="secondary" disabled={!stats} onClick={downloadCsv}>
            Export CSV
          </Button>
        </div>
      }
    >
      {error && (
        <div className="mb-3">
          <Alert tone="error" message={error} />
        </div>
      )}

      {!stats && loading ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading report…</p>
      ) : !stats ? null : stats.total === 0 ? (
        <EmptyState message="No incidents in your access scope yet, so there is nothing to report." />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Total" value={stats.total} hint="All accessible incidents" />
            <StatCard label="Active" value={stats.active} hint="Not closed or rejected" />
            <StatCard
              label="Resolved / closed"
              value={`${stats.resolved} / ${stats.closed}`}
              hint={`${stats.rejected} rejected · ${stats.cancelled} cancelled`}
            />
            <StatCard
              label="Avg. resolution"
              value={formatDuration(stats.averageResolutionMinutes)}
              hint="Reported to resolved"
            />
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <section aria-labelledby="report-status-heading">
              <h3
                id="report-status-heading"
                className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
              >
                By status
              </h3>
              <ul className="mt-2 space-y-2">
                {stats.byStatus.map((row) => (
                  <li
                    key={row.status}
                    className="grid grid-cols-[7.5rem_1fr_2.5rem] items-center gap-2"
                  >
                    <span className="truncate text-xs font-medium text-slate-600 dark:text-slate-400">
                      {row.status.replace(/_/g, " ")}
                    </span>
                    <span
                      aria-hidden
                      className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
                    >
                      <span
                        className="block h-full rounded-full bg-slate-400 dark:bg-slate-500"
                        style={{ width: `${(row.count / maxStatus) * 100}%` }}
                      />
                    </span>
                    <span className="text-right text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-300">
                      {row.count}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="report-priority-heading">
              <h3
                id="report-priority-heading"
                className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
              >
                By priority
              </h3>
              <ul className="mt-2 space-y-2">
                {stats.byPriority.map((row) => (
                  <li
                    key={row.priority}
                    className="grid grid-cols-[7.5rem_1fr_2.5rem] items-center gap-2"
                  >
                    <span className="truncate text-xs font-medium text-slate-600 dark:text-slate-400">
                      {row.priority}
                    </span>
                    <span
                      aria-hidden
                      className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
                    >
                      <span
                        className={`block h-full rounded-full ${priorityColor[row.priority]}`}
                        style={{ width: `${(row.count / maxPriority) * 100}%` }}
                      />
                    </span>
                    <span className="text-right text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-300">
                      {row.count}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section aria-labelledby="report-category-heading">
            <h3
              id="report-category-heading"
              className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
            >
              By emergency category
            </h3>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    <th scope="col" className="py-2 pr-3 font-semibold">
                      Category
                    </th>
                    <th scope="col" className="py-2 pr-3 text-right font-semibold">
                      Incidents
                    </th>
                    <th scope="col" className="py-2 text-right font-semibold">
                      Share
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {stats.byCategory.map((row) => (
                    <tr
                      key={row.name}
                      className="border-b border-slate-100 last:border-0 dark:border-slate-800/70"
                    >
                      <td className="py-2 pr-3 text-slate-700 dark:text-slate-300">{row.name}</td>
                      <td className="py-2 pr-3 text-right font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                        {row.count}
                      </td>
                      <td className="py-2 text-right tabular-nums text-slate-500 dark:text-slate-400">
                        {Math.round((row.count / stats.total) * 100)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="report-recent-heading">
            <h3
              id="report-recent-heading"
              className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
            >
              Recent incidents
            </h3>
            <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
              {stats.recent.map((incident) => (
                <li
                  key={incident.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {incident.referenceNumber}
                    </p>
                    <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                      {incident.category.name}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {formatDate(incident.createdAt)}
                      {incident.resolvedAt ? ` · resolved ${formatDate(incident.resolvedAt)}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                      {incident.priority}
                    </span>
                    <StatusBadge status={incident.status} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </Card>
  );
}
