import type { Server as HttpServer } from "node:http";
import { createClient, type RedisClientType } from "redis";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { logger } from "../lib/logger.js";
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

/** Dedicated pub/sub clients used by the Redis adapter, when attached. */
const adapterClients: RedisClientType[] = [];

/**
 * NFR-055: attaches the Socket.IO Redis adapter so events and room membership
 * are distributed across API instances. Sessions are database-backed and rate
 * limiting is Redis-backed, so with this adapter every instance can serve any
 * user behind a load balancer. Without REDIS_URL the server keeps working in
 * single-instance mode — the adapter is an enhancement, not a dependency.
 */
async function attachRedisAdapter(server: Server): Promise<void> {
  const url = process.env.REDIS_URL;
  if (!url) {
    logger.info("Socket.IO running in single-instance mode", {
      reason: "REDIS_URL not configured",
    });
    return;
  }

  const socketOptions = {
    reconnectStrategy: (retries: number) => Math.min(100 * (retries + 1), 3000),
  };

  try {
    const pubClient = createClient({ url, socket: socketOptions });
    // The subscriber needs its own connection; a client in subscriber mode
    // cannot serve regular commands.
    const subClient = pubClient.duplicate();
    pubClient.on("error", (error: Error) => {
      logger.warn("Redis adapter pub client error", error);
    });
    subClient.on("error", (error: Error) => {
      logger.warn("Redis adapter sub client error", error);
    });

    await Promise.all([pubClient.connect(), subClient.connect()]);
    adapterClients.push(pubClient, subClient);
    server.adapter(createAdapter(pubClient, subClient));
    logger.info("Socket.IO Redis adapter attached", { mode: "multi-instance ready" });
  } catch (error) {
    logger.warn("Socket.IO Redis adapter unavailable; continuing in single-instance mode", error);
  }
}

export async function initRealtime(server: HttpServer): Promise<Server> {
  io = new Server(server, { path: "/socket.io", serveClient: false });

  // Attach the adapter before the server starts accepting connections, so
  // every socket joins its rooms under the final adapter instance (replacing
  // the adapter mid-life would drop existing room memberships).
  await attachRedisAdapter(io).catch((error) => {
    logger.warn("Socket.IO Redis adapter setup failed", error);
  });

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
      logger.error("Socket authentication failed", error);
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

  const clients = [...adapterClients];
  adapterClients.length = 0;

  await Promise.all(clients.map((client) => client.quit().catch(() => undefined)));

  if (!server) {
    return;
  }

  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
}
