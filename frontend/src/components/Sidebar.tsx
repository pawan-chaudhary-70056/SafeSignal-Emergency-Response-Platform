import { useEffect, useState, type MouseEvent } from "react";
import type { Role } from "../lib/types";

type IconName =
  | "overview"
  | "report"
  | "incidents"
  | "map"
  | "reports"
  | "profile"
  | "users"
  | "audit"
  | "queue"
  | "assignments"
  | "responders";

interface NavItem {
  id: string;
  label: string;
  icon: IconName;
}

const roleMeta: Record<
  Role,
  { label: string; tagline: string; logo: string; activeIcon: string; dot: string }
> = {
  CITIZEN: {
    label: "Citizen",
    tagline: "Report and track emergencies",
    logo: "from-emerald-500 to-teal-700",
    activeIcon: "bg-emerald-500/20 text-emerald-300",
    dot: "bg-emerald-400",
  },
  DISPATCHER: {
    label: "Dispatcher",
    tagline: "Triage and coordinate response",
    logo: "from-sky-500 to-indigo-700",
    activeIcon: "bg-sky-500/20 text-sky-300",
    dot: "bg-sky-400",
  },
  RESPONDER: {
    label: "Responder",
    tagline: "Manage assignments and progress",
    logo: "from-amber-500 to-orange-700",
    activeIcon: "bg-amber-500/20 text-amber-300",
    dot: "bg-amber-400",
  },
  ADMIN: {
    label: "Administrator",
    tagline: "Govern accounts and audit activity",
    logo: "from-violet-500 to-fuchsia-700",
    activeIcon: "bg-violet-500/20 text-violet-300",
    dot: "bg-violet-400",
  },
};

const roleNav: Record<Role, NavItem[]> = {
  CITIZEN: [
    { id: "overview", label: "Overview", icon: "overview" },
    { id: "report", label: "Report emergency", icon: "report" },
    { id: "incidents", label: "My incidents", icon: "incidents" },
    { id: "profile", label: "My profile", icon: "profile" },
    { id: "map", label: "Live map", icon: "map" },
    { id: "reports", label: "Incident reports", icon: "reports" },
  ],
  DISPATCHER: [
    { id: "overview", label: "Overview", icon: "overview" },
    { id: "queue", label: "Incident queue", icon: "queue" },
    { id: "responders", label: "Available responders", icon: "responders" },
    { id: "profile", label: "My profile", icon: "profile" },
    { id: "map", label: "Live map", icon: "map" },
    { id: "reports", label: "Incident reports", icon: "reports" },
  ],
  RESPONDER: [
    { id: "overview", label: "Overview", icon: "overview" },
    { id: "profile", label: "My profile", icon: "profile" },
    { id: "assignments", label: "Assignments", icon: "assignments" },
    { id: "map", label: "Live map", icon: "map" },
    { id: "reports", label: "Incident reports", icon: "reports" },
  ],
  ADMIN: [
    { id: "overview", label: "Overview", icon: "overview" },
    { id: "users", label: "User accounts", icon: "users" },
    { id: "audit", label: "Audit log", icon: "audit" },
    { id: "profile", label: "My profile", icon: "profile" },
    { id: "reports", label: "Incident reports", icon: "reports" },
  ],
};

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  className: "h-5 w-5",
};

function NavIcon({ name }: { name: IconName }) {
  switch (name) {
    case "overview":
      return (
        <svg {...iconProps}>
          <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
          <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
          <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
          <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" />
        </svg>
      );
    case "report":
      return (
        <svg {...iconProps}>
          <path d="M12 3.5 3 20h18L12 3.5Z" />
          <path d="M12 9v4.5" />
          <path d="M12 17h.01" />
        </svg>
      );
    case "incidents":
      return (
        <svg {...iconProps}>
          <path d="M8 6h12M8 12h12M8 18h12" />
          <circle cx="4" cy="6" r="1" fill="currentColor" stroke="none" />
          <circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" />
          <circle cx="4" cy="18" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "map":
      return (
        <svg {...iconProps}>
          <path d="M12 21s6.5-5.4 6.5-10.2A6.5 6.5 0 0 0 5.5 10.8C5.5 15.6 12 21 12 21Z" />
          <circle cx="12" cy="10.5" r="2.3" />
        </svg>
      );
    case "reports":
      return (
        <svg {...iconProps}>
          <path d="M4 20V10" />
          <path d="M10 20V4" />
          <path d="M16 20v-7" />
          <path d="M22 20H2" />
        </svg>
      );
    case "profile":
      return (
        <svg {...iconProps}>
          <circle cx="12" cy="8" r="3.2" />
          <path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" />
        </svg>
      );
    case "users":
      return (
        <svg {...iconProps}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
          <path d="M16 5.4a3 3 0 0 1 0 5.9" />
          <path d="M17.5 19a5.5 5.5 0 0 0-2-4.3" />
        </svg>
      );
    case "audit":
      return (
        <svg {...iconProps}>
          <path d="M12 3.2 5.4 6v5.3c0 4.1 2.7 7.6 6.6 9.5 3.9-1.9 6.6-5.4 6.6-9.5V6L12 3.2Z" />
          <path d="m9.4 11.9 1.9 1.9 3.6-3.7" />
        </svg>
      );
    case "queue":
      return (
        <svg {...iconProps}>
          <path d="M4 13h3.5l1.4 2.8h5.8l1.4-2.8H20" />
          <path d="M5.5 5h13l1.5 8v4a2 2 0 0 1-2 2h-12a2 2 0 0 1-2-2v-4l1.5-8Z" />
        </svg>
      );
    case "assignments":
      return (
        <svg {...iconProps}>
          <rect x="5" y="4" width="14" height="17" rx="2" />
          <path d="M9 4V3h6v1" />
          <path d="M9 10h6M9 14h6M9 18h4" />
        </svg>
      );
    case "responders":
      return (
        <svg {...iconProps}>
          <path d="M3 7h11v9H3z" />
          <path d="M14 10h4l3 3v3h-7z" />
          <circle cx="7" cy="18" r="2" />
          <circle cx="17" cy="18" r="2" />
        </svg>
      );
    default:
      return null;
  }
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function Sidebar({
  role,
  userName,
  onClose,
  onNavigate,
}: {
  role: Role;
  userName: string;
  onClose?: () => void;
  onNavigate?: () => void;
}) {
  const meta = roleMeta[role];
  const items = roleNav[role];
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");

  useEffect(() => {
    setActiveId(items[0]?.id ?? "");

    const sections = items
      .map((item) => document.getElementById(item.id))
      .filter((element): element is HTMLElement => element !== null);

    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        const next = visible[0]?.target.id;
        if (next) setActiveId(next);
      },
      { rootMargin: "-20% 0px -60% 0px", threshold: [0, 0.1, 0.25, 0.5, 1] },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [items]);

  function handleNavigate(event: MouseEvent<HTMLAnchorElement>, id: string) {
    event.preventDefault();
    const target = document.getElementById(id);
    if (!target) return;

    setActiveId(id);
    window.history.replaceState(null, "", `#${id}`);
    onNavigate?.();

    // Wait for the mobile drawer (and its scroll lock) to close before
    // scrolling the page to the selected section.
    window.requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <div className="flex h-full flex-col bg-slate-950 text-slate-300">
      <header className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br shadow-lg ${meta.logo}`}
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-white">
              <path
                d="M12 3.2 5.4 6v5.3c0 4.1 2.7 7.6 6.6 9.5 3.9-1.9 6.6-5.4 6.6-9.5V6L12 3.2Z"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinejoin="round"
              />
              <path
                d="m9.4 11.9 1.9 1.9 3.6-3.7"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold tracking-tight text-white">SafeSignal</p>
            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              {meta.label} workspace
            </p>
          </div>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation menu"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 text-slate-400 transition hover:bg-white/5 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L8.94 10l-4.72 4.72a.75.75 0 1 0 1.06 1.06L10 11.06l4.72 4.72a.75.75 0 1 0 1.06-1.06L11.06 10l4.72-4.72a.75.75 0 0 0-1.06-1.06L10 8.94 5.28 4.22Z" />
            </svg>
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Workspace navigation
        </p>

        <nav aria-label={`${meta.label} workspace sections`} className="mt-2">
          <ul className="space-y-1">
            {items.map((item) => {
              const active = item.id === activeId;

              return (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    onClick={(event) => handleNavigate(event, item.id)}
                    aria-current={active ? "location" : undefined}
                    className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                      active
                        ? "bg-white/10 text-white shadow-inner ring-1 ring-white/10"
                        : "text-slate-400 hover:bg-white/5 hover:text-slate-100"
                    }`}
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition ${
                        active
                          ? meta.activeIcon
                          : "bg-white/5 text-slate-400 group-hover:text-slate-200"
                      }`}
                    >
                      <NavIcon name={item.icon} />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {active && (
                      <span
                        aria-hidden
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${meta.dot}`}
                      />
                    )}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            {meta.label} focus
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{meta.tagline}.</p>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
            Live updates stay connected while you move through the workspace.
          </p>
        </div>
      </div>

      <footer className="border-t border-white/10 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          Signed in
        </p>
        <div className="mt-2 flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-white ring-1 ring-white/15"
          >
            {initials(userName) || "?"}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{userName}</p>
            <p className="truncate text-[11px] text-slate-400">{meta.label} workspace</p>
          </div>
        </div>
        <span className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Secure session
        </span>
      </footer>
    </div>
  );
}
