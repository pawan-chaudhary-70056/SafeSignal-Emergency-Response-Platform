import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { io, type Socket } from "socket.io-client";
import { useAuth } from "./auth";

export const REALTIME_EVENTS = [
  "incident.created",
  "incident.status_updated",
  "incident.priority_updated",
  "assignment.created",
  "assignment.accepted",
  "assignment.rejected",
  "assignment.reassigned",
  "assignment.completed",
  "responder.availability_updated",
  "notification.created",
] as const;

const eventLabels: Record<string, string> = {
  "incident.created": "New incident submitted",
  "incident.status_updated": "Incident status updated",
  "incident.priority_updated": "Incident priority changed",
  "assignment.created": "New responder assignment",
  "assignment.accepted": "Assignment accepted by responder",
  "assignment.rejected": "Assignment rejected by responder",
  "assignment.reassigned": "Assignment reassigned",
  "assignment.completed": "Responder marked the incident resolved",
  "responder.availability_updated": "Responder availability updated",
  "notification.created": "New notification",
};

interface RealtimeContextValue {
  socket: Socket | null;
  connected: boolean;
}

const RealtimeContext = createContext<RealtimeContextValue>({ socket: null, connected: false });

/**
 * Holds one authenticated socket for the whole session. The cookie-based
 * handshake is verified by the API, so the connection is only created after a
 * user is signed in and is torn down on logout.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!userId) {
      setSocket(null);
      setConnected(false);
      return;
    }

    const instance = io({ path: "/socket.io", withCredentials: true });
    instance.on("connect", () => setConnected(true));
    instance.on("disconnect", () => setConnected(false));
    setSocket(instance);

    return () => {
      instance.removeAllListeners();
      instance.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [userId]);

  const value = useMemo(() => ({ socket, connected }), [socket, connected]);

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

interface RealtimeState {
  connected: boolean;
  lastEvent: string | null;
}

/**
 * Subscribes a component to the shared socket. Every event triggers the
 * caller's refresh callback plus a short-lived notice.
 */
export function useRealtime(onEvent: () => void): RealtimeState {
  const { socket, connected } = useContext(RealtimeContext);
  const [lastEvent, setLastEvent] = useState<string | null>(null);
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;
  const clearTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!socket) {
      return;
    }

    const listeners = REALTIME_EVENTS.map((event) => {
      const listener = () => {
        handlerRef.current();
        setLastEvent(eventLabels[event] ?? "New update");

        if (clearTimerRef.current !== null) {
          window.clearTimeout(clearTimerRef.current);
        }
        clearTimerRef.current = window.setTimeout(() => {
          setLastEvent(null);
          clearTimerRef.current = null;
        }, 4000);
      };

      socket.on(event, listener);
      return { event, listener };
    });

    return () => {
      for (const { event, listener } of listeners) {
        socket.off(event, listener);
      }
      if (clearTimerRef.current !== null) {
        window.clearTimeout(clearTimerRef.current);
      }
    };
  }, [socket]);

  return { connected, lastEvent };
}
