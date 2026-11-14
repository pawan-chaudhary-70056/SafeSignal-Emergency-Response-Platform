import { useEffect, useRef, useState, type ReactNode } from "react";
import { ThemeToggle } from "../components/ThemeToggle";
import { Avatar, Button, StatusBadge } from "../components/ui";

function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            observer.disconnect();
            break;
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -48px 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ease-out motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none ${
        shown ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
      } ${className}`}
    >
      {children}
    </div>
  );
}

function CheckIcon({ className = "h-2.5 w-2.5" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path
        fillRule="evenodd"
        d="M16.70 5.79a.75.75 0 0 1 .01 1.06l-7.2 7.3a.75.75 0 0 1-1.07.01L4.7 10.4a.75.75 0 1 1 1.06-1.06l3.18 3.18 6.7-6.8a.75.75 0 0 1 1.06.01Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

const trustPoints = ["Live status updates", "Role-based access", "Full audit trail"];

const roles = [
  {
    title: "Citizens",
    body: "Report what is happening with a category, contact number, and precise location. Follow the response as it unfolds.",
    points: ["Fast report form", "Live status updates", "Full status history"],
  },
  {
    title: "Dispatchers",
    body: "Verify reports, set priority, assign the nearest available responder, and reassign with a recorded reason.",
    points: ["Prioritisation", "Assign and reassign", "Audit trail"],
  },
  {
    title: "Responders",
    body: "Accept assignments, share availability, and report each stage — en route, arrived, in progress, resolved.",
    points: ["Availability toggle", "Stage-by-stage updates", "Resolution notes"],
  },
];

const steps = [
  { step: "01", title: "Citizen reports", body: "Category, description, contact, and location." },
  {
    step: "02",
    title: "Dispatcher verifies",
    body: "Review, set priority, then verify or reject.",
  },
  { step: "03", title: "Responder acts", body: "Accept, move en route, arrive, and resolve." },
  {
    step: "04",
    title: "Incident closes",
    body: "Dispatch reviews the outcome and records closure.",
  },
];

const coreFeatures: Array<{ title: string; body: string; icon: ReactNode }> = [
  {
    title: "Emergency SOS System",
    body: "One-click SOS with emergency category, description, contact and location sharing.",
    icon: (
      <>
        <path d="M12 3.2 5.4 6v5.3c0 4.1 2.7 7.6 6.6 9.5 3.9-1.9 6.6-5.4 6.6-9.5V6L12 3.2Z" />
        <path d="M12 8.5v4" />
        <path d="M12 16h.01" />
      </>
    ),
  },
  {
    title: "Live Incident Tracking",
    body: "Map-based incident location, live status and responder progress.",
    icon: (
      <>
        <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
  },
  {
    title: "Emergency Dispatch Management",
    body: "Dispatchers review emergency requests, set priority and assign responders.",
    icon: (
      <>
        <path d="m4 4 16 8-16 8 3.5-8L4 4Z" />
        <path d="M7.5 12H20" />
      </>
    ),
  },
  {
    title: "Responder Dashboard",
    body: "Assigned emergencies, accept or reject, en route, arrived and resolved status.",
    icon: (
      <>
        <path d="M3 7h11v9H3z" />
        <path d="M14 10h4l3 3v3h-7z" />
        <circle cx="7" cy="18" r="2" />
        <circle cx="17" cy="18" r="2" />
      </>
    ),
  },
  {
    title: "Notification System",
    body: "Emergency received, responder assigned and status updated notifications.",
    icon: (
      <>
        <path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 13 6 9Z" />
        <path d="M10 18a2 2 0 0 0 4 0" />
      </>
    ),
  },
  {
    title: "Incident History & Reports",
    body: "Emergency records, response timeline, incident statistics and downloadable reports.",
    icon: (
      <>
        <path d="M4 20V10" />
        <path d="M10 20V4" />
        <path d="M16 20v-7" />
        <path d="M2 20h20" />
      </>
    ),
  },
];

export function HomePage({
  onSignIn,
  onRegister,
}: {
  onSignIn: () => void;
  onRegister: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <header className="sticky top-0 z-30 border-b border-slate-200/80 dark:border-slate-800 bg-white/85 dark:bg-slate-950/85 shadow-sm shadow-slate-900/5 backdrop-blur animate-fade-in">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 shadow-sm ring-1 ring-emerald-900/10">
              <svg aria-hidden viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-white">
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
            <div>
              <p className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100">
                SafeSignal
              </p>
              <p className="hidden text-xs text-slate-600 dark:text-slate-400 sm:block">
                Emergency response coordination
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              type="button"
              onClick={onRegister}
              className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 transition hover:bg-slate-100 dark:hover:bg-slate-800 sm:inline-flex"
            >
              Create account
            </button>
            <Button onClick={onSignIn}>Sign in</Button>
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="flex-1">
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] bg-[size:56px_56px] opacity-40 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)] dark:bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] dark:opacity-30"
          />

          <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-4 py-14 sm:px-6 lg:grid-cols-[1.03fr_0.97fr] lg:py-24">
            <div>
              <div className="animate-fade-up">
                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 dark:bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-200 dark:ring-emerald-500/30">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 animate-ping-slow" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                  Emergency response platform
                </span>
              </div>

              <h1
                className="mt-5 animate-fade-up text-4xl font-bold leading-[1.08] tracking-tight text-slate-900 dark:text-slate-100 sm:text-5xl lg:text-6xl"
                style={{ animationDelay: "90ms" }}
              >
                Every emergency,
                <span className="text-aurora block">one coordinated response.</span>
              </h1>

              <p
                className="mt-5 max-w-xl animate-fade-up text-base leading-relaxed text-slate-600 dark:text-slate-400 sm:text-lg"
                style={{ animationDelay: "180ms" }}
              >
                Report an emergency in seconds, dispatch the nearest responder, and follow every
                stage on one shared timeline — from the first call to the final close.
              </p>

              <div
                className="mt-8 flex animate-fade-up flex-wrap items-center gap-3"
                style={{ animationDelay: "260ms" }}
              >
                <Button onClick={onSignIn} className="group px-6 py-3 text-base">
                  Sign in
                  <svg
                    aria-hidden
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5"
                  >
                    <path
                      fillRule="evenodd"
                      d="M3 10a.75.75 0 0 1 .75-.75h10.64l-3.22-3.22a.75.75 0 1 1 1.06-1.06l4.5 4.5a.75.75 0 0 1 0 1.06l-4.5 4.5a.75.75 0 1 1-1.06-1.06l3.22-3.22H3.75A.75.75 0 0 1 3 10Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </Button>
                <Button variant="ghost" onClick={onRegister} className="px-6 py-3 text-base">
                  Create citizen account
                </Button>
              </div>

              <ul
                className="mt-8 flex animate-fade-up flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-slate-600 dark:text-slate-400"
                style={{ animationDelay: "340ms" }}
              >
                {trustPoints.map((point) => (
                  <li key={point} className="flex items-center gap-1.5">
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-500/10 ring-1 ring-emerald-200 dark:ring-emerald-500/30">
                      <CheckIcon className="h-2.5 w-2.5 text-emerald-700 dark:text-emerald-400" />
                    </span>
                    {point}
                  </li>
                ))}
              </ul>

              <p
                className="mt-5 animate-fade-up text-xs leading-relaxed text-slate-600 dark:text-slate-400"
                style={{ animationDelay: "400ms" }}
              >
                For immediate danger, always call your local emergency number. SafeSignal
                coordinates the response — it does not replace official services.
              </p>
            </div>

            <div
              className="relative mx-auto w-full max-w-lg animate-fade-up"
              style={{ animationDelay: "220ms" }}
            >
              <div
                aria-hidden
                className="pointer-events-none absolute -right-10 -top-10 h-64 w-64 rounded-full bg-emerald-400/25 blur-3xl animate-float-slow"
              />
              <div
                aria-hidden
                className="pointer-events-none absolute -bottom-12 -left-10 h-56 w-56 rounded-full bg-sky-400/20 blur-3xl animate-float-slower"
              />

              <div className="animate-float-slow">
                <div className="relative rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xl shadow-slate-900/10">
                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                    <div>
                      <p className="font-mono text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        SS-2026-000042
                      </p>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        Fire Emergency
                      </p>
                    </div>
                    <StatusBadge status="EN_ROUTE" />
                  </div>

                  <ol className="mt-4 space-y-4 border-l border-slate-200 dark:border-slate-800 pl-4">
                    <li className="relative">
                      <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-50 dark:ring-emerald-500/20" />
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        Report received
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        10:42 · Citizen
                      </p>
                    </li>
                    <li className="relative">
                      <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-50 dark:ring-emerald-500/20" />
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        Verified by dispatch
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        10:44 · Priority HIGH
                      </p>
                    </li>
                    <li className="relative">
                      <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-sky-500 ring-4 ring-sky-50 dark:ring-sky-500/20" />
                      <span
                        aria-hidden
                        className="absolute -left-[23px] top-0.5 h-4 w-4 animate-ping-slow rounded-full bg-sky-400/40"
                      />
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        Ambulance en route
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        10:46 · ETA 6 min
                      </p>
                    </li>
                  </ol>

                  <div className="mt-4 flex items-center gap-3 rounded-xl bg-slate-50 dark:bg-slate-950 p-3">
                    <Avatar name="Bishal Karki" className="h-9 w-9" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-200">
                        Bishal Karki
                      </p>
                      <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                        AMBULANCE · Kathmandu unit
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-200 dark:ring-emerald-500/30">
                      LIVE
                    </span>
                  </div>
                </div>
              </div>

              <div className="absolute -bottom-6 -left-4 hidden animate-float-slower items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 shadow-lg shadow-slate-900/5 sm:flex">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-200 dark:ring-emerald-500/30">
                  <CheckIcon className="h-3.5 w-3.5" />
                </span>
                <div>
                  <p className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">
                    Response confirmed
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    Responder accepted · 10:47
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <Reveal>
            <div className="max-w-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400">
                Core features
              </p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
                Everything needed for a coordinated response
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                From the first SOS to the final report, each part of SafeSignal connects citizens,
                dispatchers and responders around one shared incident record.
              </p>
            </div>
          </Reveal>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {coreFeatures.map((feature, index) => (
              <Reveal key={feature.title} delay={index * 70}>
                <article className="group h-full rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-emerald-200 hover:shadow-lg hover:shadow-emerald-900/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-emerald-500/40">
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30">
                      <svg
                        aria-hidden
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-5 w-5"
                      >
                        {feature.icon}
                      </svg>
                    </span>
                    <span className="font-mono text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <h3 className="mt-4 text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                    {feature.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                    {feature.body}
                  </p>
                </article>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="border-y border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-950/60">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
            <Reveal>
              <div className="max-w-2xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400">
                  Built for every role
                </p>
                <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
                  One platform, three clear workspaces
                </h2>
              </div>
            </Reveal>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {roles.map((role, index) => (
                <Reveal key={role.title} delay={index * 90}>
                  <div className="h-full rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-emerald-200 dark:hover:border-emerald-500/40 hover:shadow-lg hover:shadow-emerald-900/5">
                    <h3 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                      {role.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                      {role.body}
                    </p>
                    <ul className="mt-4 space-y-1.5">
                      {role.points.map((point) => (
                        <li
                          key={point}
                          className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400"
                        >
                          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-500/10 ring-1 ring-emerald-200 dark:ring-emerald-500/30">
                            <CheckIcon />
                          </span>
                          {point}
                        </li>
                      ))}
                    </ul>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <Reveal>
            <div className="max-w-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400">
                From report to close
              </p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
                A clear path for every incident
              </h2>
            </div>
          </Reveal>

          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((item, index) => (
              <Reveal key={item.step} delay={index * 80}>
                <li className="group h-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 transition duration-300 hover:-translate-y-1 hover:border-emerald-200 dark:hover:border-emerald-500/40 hover:shadow-lg hover:shadow-emerald-900/5">
                  <p className="text-xs font-bold tracking-wide text-emerald-700 dark:text-emerald-400">
                    {item.step}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {item.title}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                    {item.body}
                  </p>
                  <span className="mt-4 block h-0.5 w-8 rounded-full bg-emerald-500/30 transition-all duration-300 group-hover:w-14 group-hover:bg-emerald-500" />
                </li>
              </Reveal>
            ))}
          </ol>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
          <Reveal>
            <div className="relative overflow-hidden rounded-3xl bg-slate-950 px-6 py-10 text-white sm:px-10">
              <div
                aria-hidden
                className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-emerald-500/25 blur-3xl animate-float-slow"
              />
              <div
                aria-hidden
                className="pointer-events-none absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-teal-400/15 blur-3xl animate-float-slower"
              />
              <div className="relative flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                    Ready to coordinate a response?
                  </h2>
                  <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-300">
                    Sign in with your role account, or create a citizen account to report an
                    emergency.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button onClick={onSignIn} className="group px-5 py-3">
                    Sign in
                    <svg
                      aria-hidden
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5"
                    >
                      <path
                        fillRule="evenodd"
                        d="M3 10a.75.75 0 0 1 .75-.75h10.64l-3.22-3.22a.75.75 0 1 1 1.06-1.06l4.5 4.5a.75.75 0 0 1 0 1.06l-4.5 4.5a.75.75 0 1 1-1.06-1.06l3.22-3.22H3.75A.75.75 0 0 1 3 10Z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </Button>
                  <button
                    type="button"
                    onClick={onRegister}
                    className="rounded-xl border border-white/20 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                  >
                    Create account
                  </button>
                </div>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-950/60">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-6 text-center sm:flex-row sm:px-6 sm:text-left">
          <p className="text-xs text-slate-600 dark:text-slate-400">
            SafeSignal coordinates reporting and response. It does not replace official emergency
            numbers.
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Emergency response platform · Demo build
          </p>
        </div>
      </footer>
    </div>
  );
}
