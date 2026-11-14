import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useRealtime } from "../lib/realtime";
import type { AppNotification } from "../lib/types";
import { formatDate } from "./ui";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const [list, count] = await Promise.all([
        api<{ notifications: AppNotification[] }>("/notifications?limit=10"),
        api<{ unreadCount: number }>("/notifications/unread-count"),
      ]);
      setNotifications(list.notifications);
      setUnread(count.unreadCount);
      setError(null);
    } catch {
      // The session may be ending; the next login reloads the notifications.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtime(() => {
    void load();
  });

  // Close on outside interaction without an overlay that blocks the bell itself.
  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  async function markRead(id: string) {
    try {
      await api(`/notifications/${id}/read`, { method: "PATCH" });
      await load();
    } catch {
      setError("Could not mark the notification as read.");
    }
  }

  async function markAllRead() {
    try {
      await api("/notifications/read-all", { method: "PATCH" });
      await load();
    } catch {
      setError("Could not mark notifications as read.");
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Notifications"
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls="notification-panel"
        onClick={() => setOpen((value) => !value)}
        className="relative inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 shadow-sm transition hover:bg-slate-50 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-400/30"
      >
        <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
          <path d="M10 2a5 5 0 0 0-5 5v2.6c0 .6-.2 1.2-.6 1.7l-.9 1.2c-.5.7 0 1.6.8 1.6h11.4c.8 0 1.3-.9.8-1.6l-.9-1.2a2.8 2.8 0 0 1-.6-1.7V7a5 5 0 0 0-5-5Z" />
          <path d="M8.2 16a2 2 0 0 0 3.6 0H8.2Z" />
        </svg>
        <span className="hidden sm:inline">Alerts</span>
        {unread > 0 && (
          <span className="ml-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-600 px-1.5 py-0.5 text-[11px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          id="notification-panel"
          className="absolute right-0 z-30 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl shadow-slate-900/10"
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Notifications
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {unread > 0 ? `${unread} unread` : "All caught up"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void markAllRead()}
              disabled={unread === 0}
              className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 transition hover:text-emerald-800 dark:hover:text-emerald-300 hover:underline disabled:cursor-not-allowed disabled:text-slate-400"
            >
              Mark all read
            </button>
          </div>

          {error && <p className="px-4 py-2 text-xs text-rose-600">{error}</p>}

          {notifications.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              No notifications yet.
            </p>
          ) : (
            <ul className="max-h-80 divide-y divide-slate-100 dark:divide-slate-800 overflow-y-auto">
              {notifications.map((notification) => (
                <li key={notification.id}>
                  <button
                    type="button"
                    onClick={() => void markRead(notification.id)}
                    className={`w-full px-4 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800 ${
                      notification.isRead ? "opacity-70" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        {notification.title}
                      </p>
                      {!notification.isRead && (
                        <span
                          aria-label="Unread"
                          className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500"
                        />
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                      {notification.message}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      {formatDate(notification.createdAt)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
