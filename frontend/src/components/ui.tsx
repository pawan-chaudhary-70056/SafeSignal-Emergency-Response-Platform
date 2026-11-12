import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { IncidentStatus, Pagination } from "../lib/types";

export function Card({
  title,
  subtitle,
  action,
  children,
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      {(title || action) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6 dark:border-slate-800">
          <div className="min-w-0">
            {title && (
              <h2 className="text-base font-semibold tracking-tight text-slate-900 sm:text-lg dark:text-slate-100">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="mt-1 max-w-prose text-sm text-slate-500 dark:text-slate-400">
                {subtitle}
              </p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className="px-5 py-4 sm:px-6 sm:py-5">{children}</div>
    </section>
  );
}

type Variant = "primary" | "secondary" | "danger" | "ghost";

const variantStyles: Record<Variant, string> = {
  primary:
    "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 focus-visible:ring-emerald-500/30 disabled:bg-emerald-300 dark:disabled:bg-emerald-900/50 dark:disabled:text-emerald-200/50",
  secondary:
    "bg-slate-900 text-white shadow-sm hover:bg-slate-800 focus-visible:ring-slate-500/30 disabled:bg-slate-400 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white dark:disabled:bg-slate-700 dark:disabled:text-slate-400",
  danger:
    "bg-rose-600 text-white shadow-sm hover:bg-rose-700 focus-visible:ring-rose-500/30 disabled:bg-rose-300 dark:disabled:bg-rose-900/50",
  ghost:
    "border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:ring-slate-400/30 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:disabled:text-slate-500",
};

export function Button({
  variant = "primary",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-4 disabled:cursor-not-allowed ${variantStyles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

const statusStyles: Record<IncidentStatus, { pill: string; dot: string }> = {
  SUBMITTED: {
    pill: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/30",
    dot: "bg-sky-500 dark:bg-sky-400",
  },
  UNDER_REVIEW: {
    pill: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30",
    dot: "bg-amber-500 dark:bg-amber-400",
  },
  VERIFIED: {
    pill: "bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/30",
    dot: "bg-indigo-500 dark:bg-indigo-400",
  },
  ASSIGNED: {
    pill: "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-500/30",
    dot: "bg-violet-500 dark:bg-violet-400",
  },
  ACCEPTED: {
    pill: "bg-cyan-50 text-cyan-700 ring-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-300 dark:ring-cyan-500/30",
    dot: "bg-cyan-500 dark:bg-cyan-400",
  },
  EN_ROUTE: {
    pill: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/30",
    dot: "bg-blue-500 dark:bg-blue-400",
  },
  ARRIVED: {
    pill: "bg-teal-50 text-teal-700 ring-teal-200 dark:bg-teal-500/10 dark:text-teal-300 dark:ring-teal-500/30",
    dot: "bg-teal-500 dark:bg-teal-400",
  },
  IN_PROGRESS: {
    pill: "bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-500/30",
    dot: "bg-orange-500 dark:bg-orange-400",
  },
  RESOLVED: {
    pill: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30",
    dot: "bg-emerald-500 dark:bg-emerald-400",
  },
  CLOSED: {
    pill: "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700",
    dot: "bg-slate-400 dark:bg-slate-500",
  },
  REJECTED: {
    pill: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30",
    dot: "bg-rose-500 dark:bg-rose-400",
  },
  CANCELLED: {
    pill: "bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700",
    dot: "bg-slate-400 dark:bg-slate-500",
  },
};

export function StatusBadge({ status }: { status: IncidentStatus }) {
  const styles = statusStyles[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${styles.pill}`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} />
      {status.replaceAll("_", " ")}
    </span>
  );
}

export function LiveBadge({ connected }: { connected: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
        connected
          ? "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30"
          : "bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700"
      }`}
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 rounded-full ${
          connected ? "animate-pulse bg-emerald-500" : "bg-slate-400 dark:bg-slate-500"
        }`}
      />
      {connected ? "Live" : "Offline"}
    </span>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </span>
      {children}
      {hint && (
        <span className="mt-1.5 block text-xs text-slate-500 dark:text-slate-400">{hint}</span>
      )}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 disabled:bg-slate-50 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/10 dark:disabled:bg-slate-800 dark:disabled:text-slate-500";

export function Alert({ tone, message }: { tone: "error" | "success"; message: string }) {
  const styles =
    tone === "error"
      ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
      : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300";

  return (
    <div
      role="alert"
      className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm ${styles}`}
    >
      {tone === "error" ? (
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          fill="currentColor"
          className="mt-0.5 h-4 w-4 shrink-0"
        >
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-11.25a.75.75 0 0 0-1.5 0v4.5a.75.75 0 0 0 1.5 0v-4.5ZM10 15a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
            clipRule="evenodd"
          />
        </svg>
      ) : (
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          fill="currentColor"
          className="mt-0.5 h-4 w-4 shrink-0"
        >
          <path
            fillRule="evenodd"
            d="M16.70 5.79a.75.75 0 0 1 .01 1.06l-7.2 7.3a.75.75 0 0 1-1.07.01L4.7 10.4a.75.75 0 1 1 1.06-1.06l3.18 3.18 6.7-6.8a.75.75 0 0 1 1.06.01Z"
            clipRule="evenodd"
          />
        </svg>
      )}
      <p className="leading-relaxed">{message}</p>
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-8 text-center dark:border-slate-700 dark:bg-slate-900/40">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-500 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">
        <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
          <path d="M3 5.75A2.75 2.75 0 0 1 5.75 3h8.5A2.75 2.75 0 0 1 17 5.75v8.5A2.75 2.75 0 0 1 14.25 17h-8.5A2.75 2.75 0 0 1 3 14.25v-8.5Zm2.75-1.25c-.69 0-1.25.56-1.25 1.25v8.5c0 .69.56 1.25 1.25 1.25h8.5c.69 0 1.25-.56 1.25-1.25v-8.5c0-.69-.56-1.25-1.25-1.25h-8.5Z" />
        </svg>
      </span>
      <p className="max-w-sm text-sm text-slate-600 dark:text-slate-400">{message}</p>
    </div>
  );
}

export const formatDate = (value: string): string => new Date(value).toLocaleString();

export function PaginationControls({
  pagination,
  onChange,
}: {
  pagination: Pagination;
  onChange: (page: number) => void;
}) {
  if (pagination.totalPages <= 1) {
    return (
      <p className="mt-4 border-t border-slate-100 pt-3 text-xs font-medium text-slate-500 dark:border-slate-800 dark:text-slate-400">
        {pagination.totalItems} record{pagination.totalItems === 1 ? "" : "s"}
      </p>
    );
  }

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
      <Button
        variant="ghost"
        className="px-3 py-1.5 text-xs"
        disabled={pagination.page <= 1}
        onClick={() => onChange(pagination.page - 1)}
      >
        Previous
      </Button>
      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
        Page {pagination.page} of {pagination.totalPages} · {pagination.totalItems} records
      </span>
      <Button
        variant="ghost"
        className="px-3 py-1.5 text-xs"
        disabled={pagination.page >= pagination.totalPages}
        onClick={() => onChange(pagination.page + 1)}
      >
        Next
      </Button>
    </div>
  );
}

export function Avatar({ name, className = "h-9 w-9" }: { name: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white ring-2 ring-white dark:bg-slate-100 dark:text-slate-900 dark:ring-slate-900 ${className}`}
    >
      {initials || "?"}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
        {value}
      </p>
      {hint && <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
    </div>
  );
}
