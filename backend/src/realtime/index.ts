import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { prisma } from "../lib/prisma.js";
import { hashSessionToken, parseCookies, SESSION_COOKIE } from "../lib/session.js";
import { identifyRole, type RoleCode } from "../modules/roles/index.js";

export type RealtimeEvent =
  | "incident.created"
  | "incident.status_updated"
  | "incident.priority_updated"
  | "incident.evidence_updated"
  | "assignment.created"
  | "assignment.accepted"
  | "assignment.rejected"
  | "assignment.reassigned"
  | "assignment.completed"
  | "responder.availability_updated"
  | "notification.created";

interface SocketAuth {
  userId: string;
  role: RoleCode;
}

let io: Server | null = null;

export function initRealtime(server: HttpServer): Server {
  io = new Server(server, { path: "/socket.io", serveClient: false });

  io.use(async (socket, next) => {
    try {
      const token = parseCookies(socket.handshake.headers.cookie)[SESSION_COOKIE];

      if (!token) {
        next(new Error("UNAUTHENTICATED"));
        return;
      }

      const session = await prisma.session.findUnique({
        where: { tokenHash: hashSessionToken(token) },
        include: { user: { include: { role: true } } },
      });

      if (!session || session.revokedAt !== null || session.expiresAt.getTime() <= Date.now()) {
        next(new Error("UNAUTHENTICATED"));
        return;
      }

      if (session.user.accountStatus !== "ACTIVE") {
        next(new Error("ACCOUNT_INACTIVE"));
        return;
      }

      const identified = identifyRole({ role: session.user.role.name });
      if (!identified.ok) {
        next(new Error("UNKNOWN_ROLE"));
        return;
      }

      socket.data.userId = session.user.id;
      socket.data.role = identified.role;
      next();
    } catch (error) {
      console.error("Socket authentication failed", error);
      next(new Error("UNAUTHENTICATED"));
    }
  });

  io.on("connection", (socket) => {
    const auth = socket.data as SocketAuth;

    // Rooms are derived from the verified session, never from client input.
    void socket.join(`user:${auth.userId}`);
    void socket.join(`role:${auth.role}`);

    socket.emit("connected", { userId: auth.userId, role: auth.role });
  });

  return io;
}

export function emitToUser(userId: string, event: RealtimeEvent, payload: unknown): void {
  io?.to(`user:${userId}`).emit(event, payload);
}

export function emitToRole(role: RoleCode, event: RealtimeEvent, payload: unknown): void {
  io?.to(`role:${role}`).emit(event, payload);
}

/**
 * Drops every live Socket.IO connection for a user. Called when a session is
 * revoked (logout) or authorization changes (suspension, role change).
 */
export function disconnectUser(userId: string): void {
  io?.in(`user:${userId}`).disconnectSockets(true);
}

export async function closeRealtime(): Promise<void> {
  const server = io;
  io = null;

  if (!server) {
    return;
  }

  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
}
