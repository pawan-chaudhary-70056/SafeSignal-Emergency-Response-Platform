import { Fragment, useCallback, useEffect, useState, type FormEvent } from "react";
import { DashboardHeader } from "../components/DashboardHeader";
import { IncidentReports } from "../components/IncidentReports";
import { ProfileSection } from "../components/ProfileSection";
import {
  Alert,
  Avatar,
  Button,
  Card,
  EmptyState,
  Field,
  PaginationControls,
  StatCard,
  TableShell,
  formatDate,
  inputClass,
  tableCellClass,
  tableHeadCellClass,
  tableHeadRowClass,
} from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { AdminUser, AuditLogEntry, Pagination, Role } from "../lib/types";

const roles: Role[] = ["CITIZEN", "DISPATCHER", "RESPONDER", "ADMIN"];
const PAGE_SIZE = 10;

interface CreateUserForm {
  fullName: string;
  email: string;
  password: string;
  phone: string;
  role: Role;
  responderType: string;
}

const emptyCreateForm: CreateUserForm = {
  fullName: "",
  email: "",
  password: "",
  phone: "",
  role: "CITIZEN",
  responderType: "AMBULANCE",
};

const roleFilters: Array<{ label: string; value: "" | Role }> = [
  { label: "All", value: "" },
  { label: "Citizens", value: "CITIZEN" },
  { label: "Dispatchers", value: "DISPATCHER" },
  { label: "Responders", value: "RESPONDER" },
  { label: "Admins", value: "ADMIN" },
];

const compactSelectClass =
  "w-full max-w-40 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 disabled:bg-slate-50 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/10 dark:disabled:bg-slate-800 dark:disabled:text-slate-500";

function statusBadgeClass(status: string): string {
  return status === "ACTIVE"
    ? "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30"
    : "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30";
}

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
  const [createForm, setCreateForm] = useState<CreateUserForm>(emptyCreateForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");

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

  function handleCreateUser(event: FormEvent) {
    event.preventDefault();
    const fullName = createForm.fullName.trim();

    return runAction(async () => {
      await api("/admin/users", {
        method: "POST",
        body: JSON.stringify({
          fullName,
          email: createForm.email.trim(),
          password: createForm.password,
          ...(createForm.phone.trim() ? { phone: createForm.phone.trim() } : {}),
          role: createForm.role,
          ...(createForm.role === "RESPONDER"
            ? { responderType: createForm.responderType.trim() || "GENERAL" }
            : {}),
        }),
      });
      setCreateForm(emptyCreateForm);
      return `Account created for ${fullName}.`;
    });
  }

  function startEditing(target: AdminUser) {
    setEditingId(target.id);
    setEditName(target.fullName);
    setEditPhone(target.phone ?? "");
    setError(null);
    setNotice(null);
  }

  function handleSaveProfile(event: FormEvent, target: AdminUser) {
    event.preventDefault();
    const fullName = editName.trim();

    return runAction(async () => {
      await api(`/admin/users/${target.id}/profile`, {
        method: "PATCH",
        body: JSON.stringify({ fullName, phone: editPhone.trim() || null }),
      });
      setEditingId(null);
      return `${fullName}'s profile updated.`;
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
      <DashboardHeader role="ADMIN" id="overview" />

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

      {error && <Alert tone="error" message={error} />}
      {notice && <Alert tone="success" message={notice} />}

      <Card
        id="users"
        title="User accounts"
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
        <form
          aria-label="Add user form"
          className="mb-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/40"
          onSubmit={handleCreateUser}
        >
          <p className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">Add user</p>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Full name">
              <input
                className={inputClass}
                value={createForm.fullName}
                onChange={(event) =>
                  setCreateForm({ ...createForm, fullName: event.target.value })
                }
                required
                minLength={2}
                maxLength={120}
                autoComplete="name"
              />
            </Field>
            <Field label="Email">
              <input
                className={inputClass}
                type="email"
                value={createForm.email}
                onChange={(event) =>
                  setCreateForm({ ...createForm, email: event.target.value })
                }
                required
                maxLength={255}
                autoComplete="email"
              />
            </Field>
            <Field label="Temporary password" hint="At least 8 characters.">
              <input
                className={inputClass}
                type="password"
                value={createForm.password}
                onChange={(event) =>
                  setCreateForm({ ...createForm, password: event.target.value })
                }
                required
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
              />
            </Field>
            <Field label="Phone number (optional)">
              <input
                className={inputClass}
                value={createForm.phone}
                onChange={(event) =>
                  setCreateForm({ ...createForm, phone: event.target.value })
                }
                minLength={6}
                maxLength={30}
                autoComplete="tel"
              />
            </Field>
            <Field label="Role">
              <select
                className={inputClass}
                value={createForm.role}
                onChange={(event) =>
                  setCreateForm({ ...createForm, role: event.target.value as Role })
                }
              >
                {roles.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </Field>
            {createForm.role === "RESPONDER" && (
              <Field label="Responder type">
                <input
                  className={inputClass}
                  value={createForm.responderType}
                  onChange={(event) =>
                    setCreateForm({ ...createForm, responderType: event.target.value })
                  }
                  placeholder="AMBULANCE"
                  maxLength={80}
                />
              </Field>
            )}
            <div className="flex items-end">
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : "Add user"}
              </Button>
            </div>
          </div>
        </form>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/40">
          <div
            role="group"
            aria-label="Filter users by role"
            className="flex flex-wrap items-center gap-1.5"
          >
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
                    : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-400 dark:ring-slate-700 dark:hover:bg-slate-800"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400" aria-live="polite">
            {userPagination
              ? `${userPagination.totalItems} account${userPagination.totalItems === 1 ? "" : "s"}`
              : `${users.length} accounts`}
          </p>
        </div>

        {users.length === 0 ? (
          <EmptyState message="No users for this filter." />
        ) : (
          <TableShell label="User accounts" minWidth="54rem">
            <thead className={tableHeadRowClass}>
              <tr>
                <th scope="col" className={tableHeadCellClass}>
                  User
                </th>
                <th scope="col" className={tableHeadCellClass}>
                  Role
                </th>
                <th scope="col" className={tableHeadCellClass}>
                  Status
                </th>
                <th scope="col" className={tableHeadCellClass}>
                  Joined
                </th>
                <th scope="col" className={`${tableHeadCellClass} text-right`}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {users.map((target) => {
                const isSelf = target.id === user?.id;
                const suspended = target.accountStatus !== "ACTIVE";
                const isEditing = editingId === target.id;

                return (
                  <Fragment key={target.id}>
                  <tr className="transition hover:bg-slate-50/80 dark:hover:bg-slate-950/40">
                    <td className={tableCellClass}>
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar name={target.fullName} className="h-9 w-9 shrink-0" />
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                            <span className="min-w-0 truncate">{target.fullName}</span>
                            {isSelf && (
                              <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                You
                              </span>
                            )}
                          </p>
                          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                            {target.email}
                            {target.phone ? ` · ${target.phone}` : ""}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className={tableCellClass}>
                      <select
                        className={compactSelectClass}
                        value={target.role.name}
                        aria-label={`Role for ${target.fullName}`}
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
                    </td>
                    <td className={tableCellClass}>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${statusBadgeClass(target.accountStatus)}`}
                      >
                        {target.accountStatus}
                      </span>
                    </td>
                    <td
                      className={`${tableCellClass} whitespace-nowrap text-xs text-slate-500 dark:text-slate-400`}
                    >
                      {formatDate(target.createdAt)}
                    </td>
                    <td className={`${tableCellClass} text-right`}>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          disabled={busy}
                          aria-label={`Edit profile for ${target.fullName}`}
                          onClick={() => startEditing(target)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant={suspended ? "secondary" : "danger"}
                          disabled={busy || isSelf}
                          onClick={() => void toggleStatus(target)}
                        >
                          {suspended ? "Reactivate" : "Suspend"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                  {isEditing && (
                    <tr className="bg-slate-50/70 dark:bg-slate-950/40">
                      <td colSpan={5} className={tableCellClass}>
                        <form
                          aria-label={`Edit profile for ${target.fullName}`}
                          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto] lg:items-end"
                          onSubmit={(event) => void handleSaveProfile(event, target)}
                        >
                          <Field label="Full name">
                            <input
                              className={inputClass}
                              value={editName}
                              onChange={(event) => setEditName(event.target.value)}
                              required
                              minLength={2}
                              maxLength={120}
                            />
                          </Field>
                          <Field label="Phone number">
                            <input
                              className={inputClass}
                              value={editPhone}
                              onChange={(event) => setEditPhone(event.target.value)}
                              minLength={6}
                              maxLength={30}
                              placeholder="Clear to remove"
                            />
                          </Field>
                          <Button type="submit" disabled={busy}>
                            {busy ? "Saving…" : "Save profile"}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => setEditingId(null)}
                          >
                            Cancel
                          </Button>
                        </form>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </TableShell>
        )}

        {userPagination && (
          <PaginationControls pagination={userPagination} onChange={setUserPage} />
        )}
      </Card>

      <Card
        id="audit"
        title="Audit log"
        subtitle="Newest first. Every role and status change is recorded here."
        action={
          <Button variant="ghost" disabled={busy} onClick={() => void loadLogs()}>
            Refresh
          </Button>
        }
      >
        <form
          className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/40"
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
          <p className="w-full text-xs font-medium text-slate-500 dark:text-slate-400" aria-live="polite">
            {appliedAction ? (
              <>
                Showing actions containing “{appliedAction}”
                {logPagination
                  ? ` · ${logPagination.totalItems} entr${logPagination.totalItems === 1 ? "y" : "ies"}`
                  : ""}
              </>
            ) : logPagination ? (
              `${logPagination.totalItems} entr${logPagination.totalItems === 1 ? "y" : "ies"}`
            ) : (
              "All recorded actions"
            )}
          </p>
        </form>

        {logs.length === 0 ? (
          <EmptyState
            message={
              appliedAction
                ? "No audit entries match this action filter."
                : "No audit entries yet."
            }
          />
        ) : (
          <TableShell label="Audit log" minWidth="46rem">
            <thead className={tableHeadRowClass}>
              <tr>
                <th scope="col" className={tableHeadCellClass}>
                  Action
                </th>
                <th scope="col" className={tableHeadCellClass}>
                  Actor
                </th>
                <th scope="col" className={tableHeadCellClass}>
                  Entity
                </th>
                <th scope="col" className={`${tableHeadCellClass} text-right`}>
                  When
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {logs.map((log) => (
                <tr
                  key={log.id}
                  className="transition hover:bg-slate-50/80 dark:hover:bg-slate-950/40"
                >
                  <td className={tableCellClass}>
                    <span className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {log.action}
                    </span>
                  </td>
                  <td className={tableCellClass}>
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      {log.actor?.fullName ?? "System"}
                    </p>
                    {log.actor?.email && (
                      <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                        {log.actor.email}
                      </p>
                    )}
                  </td>
                  <td className={tableCellClass}>
                    <p className="text-xs text-slate-600 dark:text-slate-400">{log.entityType}</p>
                    {log.entityId && (
                      <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        {log.entityId.slice(0, 8)}
                      </p>
                    )}
                  </td>
                  <td
                    className={`${tableCellClass} whitespace-nowrap text-right text-xs text-slate-500 dark:text-slate-400`}
                  >
                    {formatDate(log.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}

        {logPagination && (
          <PaginationControls pagination={logPagination} onChange={setLogPage} />
        )}
      </Card>

      <IncidentReports id="reports" />
      <ProfileSection id="profile" />
    </div>
  );
}
