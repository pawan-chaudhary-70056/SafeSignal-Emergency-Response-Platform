import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { NotificationBell } from "./components/NotificationBell";
import { Sidebar } from "./components/Sidebar";
import { ThemeToggle } from "./components/ThemeToggle";
import { AuthProvider, useAuth } from "./lib/auth";
import { RealtimeProvider } from "./lib/realtime";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";

// Role dashboards are code-split so each signed-in user only downloads the
// workspace they can actually open.
const AdminDashboard = lazy(() =>
  import("./pages/AdminDashboard").then((m) => ({ default: m.AdminDashboard })),
);
const CitizenDashboard = lazy(() =>
  import("./pages/CitizenDashboard").then((m) => ({ default: m.CitizenDashboard })),
);
const DispatcherDashboard = lazy(() =>
  import("./pages/DispatcherDashboard").then((m) => ({ default: m.DispatcherDashboard })),
);
const ResponderDashboard = lazy(() =>
  import("./pages/ResponderDashboard").then((m) => ({ default: m.ResponderDashboard })),
);

const roleLabel: Record<string, string> = {
  CITIZEN: "Citizen",
  DISPATCHER: "Dispatcher",
  RESPONDER: "Responder",
  ADMIN: "Administrator",
};

function Shell() {
  const { user, loading, logout } = useAuth();
  const [authView, setAuthView] = useState<"home" | "login" | "register">("home");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const mobileNavRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [user?.id]);

  useEffect(() => {
    if (!mobileNavOpen) return;

    const dialog = mobileNavRef.current;
    const focusable = dialog?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    const first = focusable?.[0];
    const last = focusable?.[focusable.length - 1];
    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";
    first?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileNavOpen(false);
        return;
      }

      if (event.key !== "Tab" || !first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      menuButtonRef.current?.focus();
    };
  }, [mobileNavOpen]);

  async function handleLogout() {
    setMobileNavOpen(false);
    await logout();
    setAuthView("home");
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3">
        <span className="h-10 w-10 animate-spin rounded-full border-2 border-slate-200 border-t-emerald-600 dark:border-slate-800 dark:border-t-emerald-400" />
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Loading SafeSignal…</p>
      </div>
    );
  }

  if (!user) {
    if (authView === "home") {
      return (
        <HomePage
          onSignIn={() => setAuthView("login")}
          onRegister={() => setAuthView("register")}
        />
      );
    }

    return (
      <LoginPage
        initialMode={authView === "register" ? "register" : "login"}
        onBack={() => setAuthView("home")}
      />
    );
  }

  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 lg:block xl:w-72">
          <Sidebar role={user.role} userName={user.fullName} />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 animate-header-in border-b border-slate-200/80 bg-white/85 shadow-sm shadow-slate-900/[0.03] backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
            <div
              aria-hidden
              className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-500"
            />
            <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-2 px-3 py-2.5 sm:gap-3 sm:px-6 sm:py-3">
              <div className="flex min-w-0 items-center gap-2">
                <button
                  ref={menuButtonRef}
                  type="button"
                  aria-label="Open navigation menu"
                  aria-controls="mobile-navigation"
                  aria-expanded={mobileNavOpen}
                  onClick={() => setMobileNavOpen(true)}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-400/30 lg:hidden dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="h-4.5 w-4.5">
                    <path d="M3 5.25a.75.75 0 0 1 .75-.75h12.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 5.25Zm0 4.75a.75.75 0 0 1 .75-.75h12.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 10Zm0 4.75a.75.75 0 0 1 .75-.75h12.5a.75.75 0 0 1 0 1.5H3.75a.75.75 0 0 1-.75-.75Z" />
                  </svg>
                </button>

                <div className="flex min-w-0 items-center gap-2.5 lg:hidden">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 shadow-sm ring-1 ring-emerald-900/10">
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
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100">
                      SafeSignal
                    </p>
                    <p className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                      {roleLabel[user.role] ?? user.role} workspace
                    </p>
                  </div>
                </div>

                <div className="hidden min-w-0 items-center gap-2 lg:flex">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                    Workspace
                  </span>
                  <span aria-hidden className="text-slate-300 dark:text-slate-700">
                    /
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30">
                    <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" />
                    {roleLabel[user.role] ?? user.role}
                  </span>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
                <ThemeToggle />
                <NotificationBell />

                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-400/30 sm:px-3 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                    <path
                      fillRule="evenodd"
                      d="M3 4.75A1.75 1.75 0 0 1 4.75 3h5.5a.75.75 0 0 1 0 1.5h-5.5a.25.25 0 0 0-.25.25v10.5c0 .14.11.25.25.25h5.5a.75.75 0 0 1 0 1.5h-5.5A1.75 1.75 0 0 1 3 15.25V4.75Zm10.47 2.47a.75.75 0 0 1 1.06 0l3 3a.75.75 0 0 1 0 1.06l-3 3a.75.75 0 1 1-1.06-1.06l1.72-1.72H8.75a.75.75 0 0 1 0-1.5h6.44l-1.72-1.72a.75.75 0 0 1 0-1.06Z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="hidden sm:inline">Sign out</span>
                  <span className="sr-only sm:hidden">Sign out</span>
                </button>
              </div>
            </div>
          </header>

          <main
            id="main-content"
            tabIndex={-1}
            className="mx-auto w-full max-w-7xl flex-1 px-3 py-5 sm:px-6 sm:py-6 lg:py-8"
          >
            <div key={user.role} className="animate-page-in">
              <Suspense
                fallback={
                  <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3">
                    <span className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-emerald-600 dark:border-slate-800 dark:border-t-emerald-400" />
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                      Loading workspace…
                    </p>
                  </div>
                }
              >
                {user.role === "CITIZEN" && <CitizenDashboard />}
                {user.role === "DISPATCHER" && <DispatcherDashboard />}
                {user.role === "RESPONDER" && <ResponderDashboard />}
                {user.role === "ADMIN" && <AdminDashboard />}
              </Suspense>
            </div>
          </main>

          <footer className="mx-auto w-full max-w-7xl px-4 pb-8 text-center text-xs text-slate-500 sm:px-6 dark:text-slate-400">
            SafeSignal coordinates reporting and response. It does not replace official emergency
            numbers.
          </footer>
        </div>
      </div>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            aria-hidden
            onClick={() => setMobileNavOpen(false)}
            className="absolute inset-0 animate-overlay-in bg-slate-950/70 backdrop-blur-sm"
          />
          <div
            id="mobile-navigation"
            ref={mobileNavRef}
            role="dialog"
            aria-modal="true"
            aria-label="Workspace navigation"
            className="absolute inset-y-0 left-0 w-72 max-w-[85vw] animate-drawer-in overflow-hidden shadow-2xl"
          >
            <Sidebar
              role={user.role}
              userName={user.fullName}
              onClose={() => setMobileNavOpen(false)}
              onNavigate={() => setMobileNavOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <RealtimeProvider>
        <Shell />
      </RealtimeProvider>
    </AuthProvider>
  );
}
