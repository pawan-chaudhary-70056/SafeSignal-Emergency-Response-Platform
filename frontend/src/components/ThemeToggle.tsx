import { useEffect, useState } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "safesignal-theme";

function readTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(readTheme());
  }, []);

  function toggle() {
    const next: Theme = readTheme() === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Persistence is best-effort; the page still switches for this session.
    }
    setTheme(next);
  }

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      aria-pressed={isDark}
      className={`inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-400/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 ${className}`}
    >
      {isDark ? (
        <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-amber-400">
          <path d="M10 2.5a.75.75 0 0 1 .75.75v1a.75.75 0 0 1-1.5 0v-1A.75.75 0 0 1 10 2.5ZM10 15a.75.75 0 0 1 .75.75v1a.75.75 0 0 1-1.5 0v-1A.75.75 0 0 1 10 15ZM3.05 4.11a.75.75 0 0 1 1.06 0l.7.7a.75.75 0 1 1-1.05 1.06l-.71-.7a.75.75 0 0 1 0-1.06Zm11.44 11.44a.75.75 0 0 1 1.06 0l.7.7a.75.75 0 1 1-1.05 1.06l-.71-.7a.75.75 0 0 1 0-1.06ZM2.5 10a.75.75 0 0 1 .75-.75h1a.75.75 0 0 1 0 1.5h-1A.75.75 0 0 1 2.5 10Zm12.5 0a.75.75 0 0 1 .75-.75h1a.75.75 0 0 1 0 1.5h-1A.75.75 0 0 1 15 10ZM4.11 16.95a.75.75 0 0 1 0-1.06l.7-.7a.75.75 0 1 1 1.06 1.05l-.7.71a.75.75 0 0 1-1.06 0Zm11.44-11.44a.75.75 0 0 1 0-1.06l.7-.7a.75.75 0 1 1 1.06 1.05l-.7.71a.75.75 0 0 1-1.06 0ZM10 6.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" />
        </svg>
      ) : (
        <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-slate-600">
          <path d="M10 2.5a8 8 0 0 0 8 8 8.5 8.5 0 1 1-8-8Z" />
        </svg>
      )}
      <span className="hidden sm:inline">{isDark ? "Light" : "Dark"}</span>
    </button>
  );
}
