import { useState } from "react";
import { NotificationBell } from "./components/NotificationBell";
import { ThemeToggle } from "./components/ThemeToggle";
import { Avatar } from "./components/ui";
import { AuthProvider, useAuth } from "./lib/auth";
import { RealtimeProvider } from "./lib/realtime";
import { AdminDashboard } from "./pages/AdminDashboard";
import { CitizenDashboard } from "./pages/CitizenDashboard";
import { DispatcherDashboard } from "./pages/DispatcherDashboard";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { ResponderDashboard } from "./pages/ResponderDashboard";

const roleLabel: Record<string, string> = {
  CITIZEN: "Citizen",
  DISPATCHER: "Dispatcher",
  RESPONDER: "Responder",
  ADMIN: "Administrator",
};

function Shell() {
  const { user, loading, logout } = useAuth();
  const [authView, setAuthView] = useState<"home" | "login" | "register">("home");

  async function handleLogout() {
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
    <div className="flex min-h-screen flex-col">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <header className="sticky top-0 z-30 animate-header-in border-b border-slate-200/80 bg-white/85 shadow-sm shadow-slate-900/[0.03] backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-500"
        />
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
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
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100">
                  SafeSignal
                </p>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30">
                  <span aria-hidden className="h-1 w-1 rounded-full bg-emerald-500 dark:bg-emerald-400" />
                  {roleLabel[user.role] ?? user.role}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Emergency response coordination
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <NotificationBell />

            <div className="hidden items-center gap-2.5 border-l border-slate-200 pl-3 sm:flex dark:border-slate-800">
              <Avatar name={user.fullName} />
              <div className="max-w-[14rem] leading-tight">
                <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {user.fullName}
                </p>
                <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                  {user.email}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleLogout()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-400/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path
                  fillRule="evenodd"
                  d="M3 4.75A1.75 1.75 0 0 1 4.75 3h5.5a.75.75 0 0 1 0 1.5h-5.5a.25.25 0 0 0-.25.25v10.5c0 .14.11.25.25.25h5.5a.75.75 0 0 1 0 1.5h-5.5A1.75 1.75 0 0 1 3 15.25V4.75Zm10.47 2.47a.75.75 0 0 1 1.06 0l3 3a.75.75 0 0 1 0 1.06l-3 3a.75.75 0 1 1-1.06-1.06l1.72-1.72H8.75a.75.75 0 0 1 0-1.5h6.44l-1.72-1.72a.75.75 0 0 1 0-1.06Z"
                  clipRule="evenodd"
                />
              </svg>
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:py-8"
      >
        <div key={user.role} className="animate-page-in">
          {user.role === "CITIZEN" && <CitizenDashboard />}
          {user.role === "DISPATCHER" && <DispatcherDashboard />}
          {user.role === "RESPONDER" && <ResponderDashboard />}
          {user.role === "ADMIN" && <AdminDashboard />}
        </div>
      </main>

      <footer className="mx-auto w-full max-w-7xl px-4 pb-8 text-center text-xs text-slate-500 sm:px-6 dark:text-slate-400">
        SafeSignal coordinates reporting and response. It does not replace official emergency
        numbers.
      </footer>
    </div>
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
