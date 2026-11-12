import { useCallback, useEffect, useState } from "react";
import { DashboardHeader } from "../components/DashboardHeader";
import { IncidentReports } from "../components/IncidentReports";
import {
  Alert,
  Avatar,
  Button,
  Card,
  EmptyState,
  PaginationControls,
  StatCard,
  formatDate,
  inputClass,
} from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { AdminUser, AuditLogEntry, Pagination, Role } from "../lib/types";

const roles: Role[] = ["CITIZEN", "DISPATCHER", "RESPONDER", "ADMIN"];
const PAGE_SIZE = 10;

const roleFilters: Array<{ label: string; value: "" | Role }> = [
  { label: "All", value: "" },
  { label: "Citizens", value: "CITIZEN" },
  { label: "Dispatchers", value: "DISPATCHER" },
  { label: "Responders", value: "RESPONDER" },
  { label: "Admins", value: "ADMIN" },
];

export function AdminDashboard() {
  const { user } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roleFilter, setRoleFilter] = useState<"" | Role>("");
  const [userPage, setUserPage] = useState(1);
  const [userPagination, setUserPagination] = useState<Pagination | null>(null);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [logPage, setLogPage] = useState(1);
  const [logPagination, setLogPagination] = useState<Pagination | null>(null);
  const [actionFilter, setActionFilter] = useState("");
  const [appliedAction, setAppliedAction] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadUsers = useCallback(async () => {
    const query = new URLSearchParams({
      page: String(userPage),
      limit: String(PAGE_SIZE),
    });
    if (roleFilter) query.set("role", roleFilter);

    const response = await api<{ users: AdminUser[]; pagination: Pagination }>(
      `/admin/users?${query.toString()}`,
    );
    setUsers(response.users);
    setUserPagination(response.pagination);

    if (userPage > response.pagination.totalPages) {
      setUserPage(Math.max(1, response.pagination.totalPages));
    }
  }, [roleFilter, userPage]);

  const loadLogs = useCallback(async () => {
    const query = new URLSearchParams({
      page: String(logPage),
      limit: String(PAGE_SIZE),
    });
    if (appliedAction) query.set("action", appliedAction);

    const response = await api<{ logs: AuditLogEntry[]; pagination: Pagination }>(
      `/admin/audit-logs?${query.toString()}`,
    );
    setLogs(response.logs);
    setLogPagination(response.pagination);

    if (logPage > response.pagination.totalPages) {
      setLogPage(Math.max(1, response.pagination.totalPages));
    }
  }, [appliedAction, logPage]);

  useEffect(() => {
    loadUsers().catch((caught) => setError(errorMessage(caught)));
  }, [loadUsers]);

  useEffect(() => {
    loadLogs().catch((caught) => setError(errorMessage(caught)));
  }, [loadLogs]);

  async function runAction(action: () => Promise<string>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const message = await action();
      setNotice(message);
      await Promise.all([loadUsers(), loadLogs()]);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  function changeRole(target: AdminUser, role: Role) {
    return runAction(async () => {
      await api(`/admin/users/${target.id}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      return `${target.fullName}'s role changed to ${role}.`;
    });
  }

  function toggleStatus(target: AdminUser) {
    const next = target.accountStatus === "ACTIVE" ? "SUSPENDED" : "ACTIVE";

    return runAction(async () => {
      await api(`/admin/users/${target.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ accountStatus: next }),
      });
      return `${target.fullName} is now ${next}.`;
    });
  }

  function applyActionFilter() {
    setAppliedAction(actionFilter.trim());
    setLogPage(1);
  }

  function clearActionFilter() {
    setActionFilter("");
    setAppliedAction("");
    setLogPage(1);
  }

  return (
    <div className="space-y-6">
      <DashboardHeader role="ADMIN" />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard
          label="Accounts"
          value={userPagination?.totalItems ?? users.length}
          hint={roleFilter ? `Filtered: ${roleFilter}` : "All roles"}
        />
        <StatCard label="On this page" value={users.length} hint="Paginated view" />
        <StatCard
          label="Audit entries"
          value={logPagination?.totalItems ?? "—"}
          hint={appliedAction ? `Filtered: ${appliedAction}` : "Role, status and auth events"}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <Card
          title="Users"
          subtitle="Change roles and suspend or reactivate accounts. Your own account cannot be changed here."
          action={
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() =>
                void runAction(async () => {
                  await loadUsers();
                  return "User list refreshed.";
                })
              }
            >
              Refresh
            </Button>
          }
        >
          <div className="mb-4 flex flex-wrap gap-1.5">
            {roleFilters.map((option) => (
              <button
                key={option.value || "all"}
                type="button"
                aria-pressed={roleFilter === option.value}
                onClick={() => {
                  setRoleFilter(option.value);
                  setUserPage(1);
                }}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  roleFilter === option.value
                    ? "bg-slate-900 text-white shadow-sm dark:bg-slate-100 dark:text-slate-900"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

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

          {users.length === 0 ? (
            <EmptyState message="No users for this filter." />
          ) : (
            <ul className="space-y-2.5">
              {users.map((target) => {
                const isSelf = target.id === user?.id;
                const suspended = target.accountStatus !== "ACTIVE";

                return (
                  <li
                    key={target.id}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 transition hover:shadow-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar name={target.fullName} className="h-10 w-10" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {target.fullName}
                            {isSelf && (
                              <span className="ml-2 rounded-full bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                You
                              </span>
                            )}
                          </p>
                          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                            {target.email}
                            {target.phone ? ` · ${target.phone}` : ""}
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                            Joined {formatDate(target.createdAt)}
                          </p>
                        </div>
                      </div>

                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${
                          suspended
                            ? "bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-rose-200 dark:ring-rose-500/30"
                            : "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-200 dark:ring-emerald-500/30"
                        }`}
                      >
                        {target.accountStatus}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 dark:border-slate-800 pt-3">
                      <label className="w-40 text-xs">
                        <span className="mb-1 block font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Role
                        </span>
                        <select
                          className={inputClass}
                          value={target.role.name}
                          disabled={busy || isSelf}
                          onChange={(event) =>
                            void changeRole(target, event.target.value as Role)
                          }
                        >
                          {roles.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                      </label>

                      <Button
                        variant={suspended ? "secondary" : "danger"}
                        className="ml-auto"
                        disabled={busy || isSelf}
                        onClick={() => void toggleStatus(target)}
                      >
                        {suspended ? "Reactivate" : "Suspend"}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {userPagination && (
            <PaginationControls pagination={userPagination} onChange={setUserPage} />
          )}
        </Card>

        <Card
          title="Audit log"
          subtitle="Newest first. Every role and status change is recorded here."
          action={
            <Button variant="ghost" disabled={busy} onClick={() => void loadLogs()}>
              Refresh
            </Button>
          }
        >
          <form
            className="mb-3 flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              applyActionFilter();
            }}
          >
            <label className="min-w-0 flex-1 text-xs">
              <span className="mb-1 block font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Filter by action
              </span>
              <input
                className={inputClass}
                value={actionFilter}
                onChange={(event) => setActionFilter(event.target.value)}
                placeholder="admin.user_status_changed"
                aria-label="Filter audit log by action"
              />
            </label>
            <Button type="submit" variant="secondary" disabled={busy}>
              Apply
            </Button>
            {appliedAction && (
              <Button type="button" variant="ghost" disabled={busy} onClick={clearActionFilter}>
                Clear
              </Button>
            )}
          </form>

          {appliedAction && (
            <p className="mb-3 text-[11px] text-slate-500 dark:text-slate-400">
              Showing actions containing “{appliedAction}”.
            </p>
          )}

          {logs.length === 0 ? (
            <EmptyState
              message={
                appliedAction
                  ? "No audit entries match this action filter."
                  : "No audit entries yet."
              }
            />
          ) : (
            <ol className="space-y-3 border-l border-slate-200 dark:border-slate-800 pl-4">
              {logs.map((log) => (
                <li key={log.id} className="relative">
                  <span
                    aria-hidden
                    className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-slate-400 ring-4 ring-slate-100 dark:ring-slate-800"
                  />
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{log.action}</p>
                    <p className="shrink-0 text-[11px] text-slate-500 dark:text-slate-400">
                      {formatDate(log.createdAt)}
                    </p>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-400">
                    {log.actor?.fullName ?? "System"}
                    {log.actor?.email ? ` (${log.actor.email})` : ""}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {log.entityType}
                    {log.entityId ? ` · ${log.entityId.slice(0, 8)}` : ""}
                  </p>
                </li>
              ))}
            </ol>
          )}

          {logPagination && (
            <PaginationControls pagination={logPagination} onChange={setLogPage} />
          )}
        </Card>
      </div>

      <IncidentReports />
    </div>
  );
}
