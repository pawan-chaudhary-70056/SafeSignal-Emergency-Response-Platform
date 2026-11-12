import { useEffect, useRef, useState } from "react";
import { Button, inputClass } from "./ui";

export interface FilterOption {
  label: string;
  value: string;
}

export function ListFilters({
  search,
  onSearchChange,
  searchPlaceholder = "Search reference, description or location",
  status,
  statusOptions,
  onStatusChange,
  priority,
  priorityOptions,
  onPriorityChange,
  resultSummary,
  busy = false,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  status: string;
  statusOptions: FilterOption[];
  onStatusChange: (value: string) => void;
  priority?: string;
  priorityOptions?: FilterOption[];
  onPriorityChange?: (value: string) => void;
  resultSummary?: string;
  busy?: boolean;
}) {
  const [query, setQuery] = useState(search);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    setQuery(search);
  }, [search]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    },
    [],
  );

  function updateSearch(value: string) {
    setQuery(value);

    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      onSearchChange(value.trim());
      timerRef.current = null;
    }, 300);
  }

  function clearFilters() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setQuery("");
    onSearchChange("");
    onStatusChange("");
    onPriorityChange?.("");
  }

  const active = query.trim() !== "" || status !== "" || (priority ?? "") !== "";

  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/40">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[13rem] flex-1">
          <span className="sr-only">Search incidents</span>
          <svg
            aria-hidden
            viewBox="0 0 20 20"
            fill="currentColor"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
          >
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 1 0 3.4 9.84l3.13 3.13a.75.75 0 1 0 1.06-1.06l-3.13-3.13A5.5 5.5 0 0 0 9 3.5ZM5 9a4 4 0 1 1 8 0 4 4 0 0 1-8 0Z"
              clipRule="evenodd"
            />
          </svg>
          <input
            className={`${inputClass} pl-9`}
            value={query}
            onChange={(event) => updateSearch(event.target.value)}
            placeholder={searchPlaceholder}
            type="search"
            disabled={busy}
          />
        </label>

        {priorityOptions && onPriorityChange && (
          <label className="w-44">
            <span className="sr-only">Filter by priority</span>
            <select
              className={inputClass}
              value={priority ?? ""}
              onChange={(event) => onPriorityChange(event.target.value)}
              disabled={busy}
            >
              {priorityOptions.map((option) => (
                <option key={option.value || "all"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {active && (
          <Button type="button" variant="ghost" disabled={busy} onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-1.5">
          {statusOptions.map((option) => (
            <button
              key={option.value || "all"}
              type="button"
              aria-pressed={status === option.value}
              disabled={busy}
              onClick={() => onStatusChange(option.value)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed ${
                status === option.value
                  ? "bg-slate-900 text-white shadow-sm dark:bg-slate-100 dark:text-slate-900"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {resultSummary && (
          <p
            aria-live="polite"
            className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
          >
            {resultSummary}
          </p>
        )}
      </div>
    </div>
  );
}
