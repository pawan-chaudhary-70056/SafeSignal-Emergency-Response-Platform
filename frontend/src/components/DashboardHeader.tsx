import type { ReactNode } from "react";
import type { Role } from "../lib/types";

interface RoleTheme {
  eyebrow: string;
  title: string;
  description: string;
  shell: string;
  iconWrap: string;
  eyebrowColor: string;
  icon: ReactNode;
}

const themes: Record<Role, RoleTheme> = {
  CITIZEN: {
    eyebrow: "Citizen workspace",
    title: "Emergency reporting",
    description:
      "Share what is happening, attach your location, and follow every response update in one place.",
    shell:
      "border-emerald-200/70 bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:border-emerald-500/20 dark:from-emerald-950/40 dark:via-slate-900 dark:to-slate-900",
    iconWrap: "bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-900/20",
    eyebrowColor: "text-emerald-700 dark:text-emerald-300",
    icon: (
      <>
        <circle cx="12" cy="8" r="3.2" />
        <path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" />
      </>
    ),
  },
  DISPATCHER: {
    eyebrow: "Dispatch workspace",
    title: "Dispatch control",
    description:
      "Triage incoming reports, set priority, and coordinate the right responder for every incident.",
    shell:
      "border-sky-200/70 bg-gradient-to-br from-sky-50 via-white to-indigo-50 dark:border-sky-500/20 dark:from-sky-950/40 dark:via-slate-900 dark:to-slate-900",
    iconWrap: "bg-gradient-to-br from-sky-500 to-indigo-600 shadow-sky-900/20",
    eyebrowColor: "text-sky-700 dark:text-sky-300",
    icon: (
      <>
        <path d="M4 13a8 8 0 0 1 16 0" />
        <path d="M7 13a5 5 0 0 1 10 0" />
        <circle cx="12" cy="13" r="1.6" />
        <path d="M12 14.6V20" />
        <path d="M9 20h6" />
      </>
    ),
  },
  RESPONDER: {
    eyebrow: "Responder workspace",
    title: "Response operations",
    description:
      "Accept assignments, keep availability current, and record each stage from en route to resolved.",
    shell:
      "border-amber-200/70 bg-gradient-to-br from-amber-50 via-white to-orange-50 dark:border-amber-500/20 dark:from-amber-950/30 dark:via-slate-900 dark:to-slate-900",
    iconWrap: "bg-gradient-to-br from-amber-500 to-orange-600 shadow-amber-900/20",
    eyebrowColor: "text-amber-700 dark:text-amber-300",
    icon: (
      <>
        <path d="M3 7h11v9H3z" />
        <path d="M14 10h4l3 3v3h-7z" />
        <circle cx="7" cy="18" r="2" />
        <circle cx="17" cy="18" r="2" />
      </>
    ),
  },
  ADMIN: {
    eyebrow: "Administration",
    title: "Platform administration",
    description:
      "Manage accounts and roles, review audit activity, and keep platform operations accountable.",
    shell:
      "border-violet-200/70 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 dark:border-violet-500/20 dark:from-violet-950/40 dark:via-slate-900 dark:to-slate-900",
    iconWrap: "bg-gradient-to-br from-violet-500 to-fuchsia-600 shadow-violet-900/20",
    eyebrowColor: "text-violet-700 dark:text-violet-300",
    icon: (
      <>
        <path d="M12 3.2 5.4 6v5.3c0 4.1 2.7 7.6 6.6 9.5 3.9-1.9 6.6-5.4 6.6-9.5V6L12 3.2Z" />
        <path d="M9.5 12h5" />
        <path d="M12 9.5v5" />
      </>
    ),
  },
};

export function DashboardHeader({ role, meta }: { role: Role; meta?: ReactNode }) {
  const theme = themes[role];

  return (
    <section
      aria-labelledby="workspace-heading"
      className={`relative overflow-hidden rounded-3xl border p-5 shadow-sm sm:p-7 ${theme.shell}`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-white/50 blur-3xl dark:bg-white/5"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-28 left-1/3 h-56 w-56 rounded-full bg-white/30 blur-3xl dark:bg-white/5"
      />

      <div className="relative flex flex-wrap items-start justify-between gap-5">
        <div className="flex min-w-0 items-start gap-4">
          <span
            aria-hidden
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-lg ${theme.iconWrap}`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6"
            >
              {theme.icon}
            </svg>
          </span>

          <div className="min-w-0">
            <p
              className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${theme.eyebrowColor}`}
            >
              {theme.eyebrow}
            </p>
            <h1
              id="workspace-heading"
              className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl"
            >
              {theme.title}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              {theme.description}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {meta}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white/75 px-3 py-1.5 text-[11px] font-semibold text-slate-600 shadow-sm backdrop-blur dark:border-slate-700/80 dark:bg-slate-900/70 dark:text-slate-300">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Role-protected workspace
          </span>
        </div>
      </div>
    </section>
  );
}
