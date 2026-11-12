import { useState, type FormEvent } from "react";
import { ThemeToggle } from "../components/ThemeToggle";
import { Alert, Button, Field, inputClass } from "../components/ui";
import { errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";

const demoAccounts = [
  { label: "Citizen", email: "citizen@safesignal.local" },
  { label: "Dispatcher", email: "dispatcher@safesignal.local" },
  { label: "Responder", email: "responder@safesignal.local" },
];

const features = [
  {
    title: "Report in seconds",
    body: "Citizens submit category, location, and contact details in one short form.",
  },
  {
    title: "Dispatch with clarity",
    body: "Dispatchers verify, prioritise, assign, and reassign with a recorded reason.",
  },
  {
    title: "Track every stage",
    body: "Responders update progress in real time and everyone sees the same history.",
  },
];

export function LoginPage({
  initialMode = "login",
  onBack,
}: {
  initialMode?: "login" | "register";
  onBack?: () => void;
}) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const [email, setEmail] = useState("citizen@safesignal.local");
  const [password, setPassword] = useState("Password123!");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setBusy(true);

    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register({ fullName, email, password });
        setSuccess("Account created. Signing you in…");
        await login(email, password);
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen animate-page-in bg-slate-50 dark:bg-slate-950 lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-slate-950 p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-emerald-500/20 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-40 -left-24 h-96 w-96 rounded-full bg-sky-500/10 blur-3xl"
        />

        <div className="relative">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 shadow-lg shadow-emerald-900/40">
              <svg aria-hidden viewBox="0 0 24 24" fill="none" className="h-6 w-6 text-white">
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
              <p className="text-lg font-bold tracking-tight">SafeSignal</p>
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-300/80">
                Emergency response platform
              </p>
            </div>
          </div>

          <h1 className="mt-14 max-w-md text-4xl font-bold leading-tight tracking-tight xl:text-5xl">
            Every emergency,
            <span className="block text-emerald-400">one coordinated response.</span>
          </h1>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-300">
            One shared timeline for citizens, dispatchers, and responders — from the first report to
            the final close.
          </p>

          <ul className="mt-10 space-y-5">
            {features.map((feature) => (
              <li key={feature.title} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 ring-1 ring-emerald-400/30">
                  <svg
                    aria-hidden
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-3.5 w-3.5 text-emerald-300"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.70 5.79a.75.75 0 0 1 .01 1.06l-7.2 7.3a.75.75 0 0 1-1.07.01L4.7 10.4a.75.75 0 1 1 1.06-1.06l3.18 3.18 6.7-6.8a.75.75 0 0 1 1.06.01Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{feature.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{feature.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Demo environment
          </p>
          <p className="mt-1 text-xs text-slate-300">
            Sign in with a demo account and password{" "}
            <span className="font-mono text-emerald-300">Password123!</span>
          </p>
        </div>
      </section>

      <section className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-5 flex items-center justify-between gap-3">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-1.5 rounded-lg text-sm font-semibold text-slate-500 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              >
                <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path
                    fillRule="evenodd"
                    d="M12.79 5.23a.75.75 0 0 1-.02 1.06L8.83 10l3.94 3.71a.75.75 0 1 1-1.04 1.08l-4.5-4.25a.75.75 0 0 1 0-1.08l4.5-4.25a.75.75 0 0 1 1.06.02Z"
                    clipRule="evenodd"
                  />
                </svg>
                Back to home
              </button>
            ) : (
              <span />
            )}
            <ThemeToggle />
          </div>

          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 shadow-sm">
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
            <p className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">SafeSignal</p>
          </div>

          <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm sm:p-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400">
              {mode === "login" ? "Welcome back" : "Create your account"}
            </p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              {mode === "login" ? "Sign in to SafeSignal" : "Register as a citizen"}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              {mode === "login"
                ? "Report emergencies, dispatch responses, or update assignment progress."
                : "Citizens can self-register. Dispatcher and Responder accounts are provisioned by an administrator."}
            </p>

            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              {mode === "register" && (
                <Field label="Full name">
                  <input
                    className={inputClass}
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder="Test Citizen"
                    required
                    minLength={2}
                  />
                </Field>
              )}

              <Field label="Email">
                <input
                  className={inputClass}
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </Field>

              <Field
                label="Password"
                hint={mode === "register" ? "At least 8 characters." : undefined}
              >
                <input
                  className={inputClass}
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  minLength={mode === "register" ? 8 : 1}
                />
              </Field>

              {error && <Alert tone="error" message={error} />}
              {success && <Alert tone="success" message={success} />}

              <Button type="submit" disabled={busy} className="w-full">
                {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create citizen account"}
              </Button>
            </form>

            <button
              type="button"
              className="mt-4 w-full rounded-lg py-1 text-sm font-semibold text-emerald-700 dark:text-emerald-300 transition hover:text-emerald-800 dark:hover:text-emerald-300 hover:underline"
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError(null);
                setSuccess(null);
              }}
            >
              {mode === "login" ? "New citizen? Create an account" : "Already registered? Sign in"}
            </button>

            {mode === "login" && (
              <div className="mt-6 border-t border-slate-100 dark:border-slate-800 pt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                  Demo accounts · password Password123!
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {demoAccounts.map((account) => (
                    <button
                      key={account.email}
                      type="button"
                      onClick={() => {
                        setEmail(account.email);
                        setPassword("Password123!");
                      }}
                      className="rounded-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 shadow-sm transition hover:border-emerald-300 dark:hover:border-emerald-500/40 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 hover:text-emerald-700 dark:hover:text-emerald-300"
                    >
                      {account.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <p className="mt-6 text-center text-xs text-slate-500 dark:text-slate-400">
            For immediate danger, always call your local emergency number.
          </p>
        </div>
      </section>
    </main>
  );
}
