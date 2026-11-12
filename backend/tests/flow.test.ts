import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, beforeEach, describe, it } from "node:test";
import { io as createSocketClient, type Socket } from "socket.io-client";
import request from "supertest";
import { app } from "../src/app.js";
import { hashPassword } from "../src/lib/password.js";
import { prisma } from "../src/lib/prisma.js";
import { closeRedis } from "../src/lib/redis.js";
import { resetRateLimits } from "../src/middleware/rate-limit.js";
import { closeRealtime, initRealtime } from "../src/realtime/index.js";

const PASSWORD = "Password123!";

function databaseName(): string {
  return decodeURIComponent(new URL(process.env.DATABASE_URL ?? "").pathname.replace(/^\//, ""));
}

async function assertIsolatedTestDatabase() {
  const name = databaseName();

  assert.ok(name, "DATABASE_URL is not set; run `npm test` so .env.test is loaded");
  assert.ok(
    name.endsWith("_test"),
    `refusing to truncate database "${name}": the test database name must end in "_test"`,
  );

  const [connected] = await prisma.$queryRawUnsafe<{ current: string }[]>(
    "SELECT current_database() AS current",
  );

  assert.equal(
    connected?.current,
    name,
    "the connected database does not match DATABASE_URL; refusing to truncate it",
  );
}

async function resetDatabase() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Notification", "AuditLog", "Assignment", "IncidentStatusHistory", "Incident", "ResponderProfile", "Session", "User", "EmergencyCategory", "Role" RESTART IDENTITY CASCADE',
  );
  await prisma.role.createMany({
    data: [
      { name: "CITIZEN", description: "Citizen" },
      { name: "DISPATCHER", description: "Dispatcher" },
      { name: "RESPONDER", description: "Responder" },
      { name: "ADMIN", description: "Administrator" },
    ],
  });
  await prisma.emergencyCategory.create({
    data: { name: "Medical Emergency", description: "Medical" },
  });
}

async function createUser(roleName: string, email: string) {
  const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });

  return prisma.user.create({
    data: {
      fullName: `${roleName} User`,
      email,
      passwordHash: await hashPassword(PASSWORD),
      roleId: role.id,
      ...(roleName === "RESPONDER"
        ? { responderProfile: { create: { responderType: "AMBULANCE" } } }
        : {}),
    },
  });
}

async function login(email: string) {
  const agent = request.agent(app);
  const response = await agent.post("/api/v1/auth/login").send({ email, password: PASSWORD });
  assert.equal(response.status, 200, `login failed for ${email}: ${response.text}`);
  return agent;
}

async function loginCookie(email: string): Promise<string> {
  const response = await request(app).post("/api/v1/auth/login").send({ email, password: PASSWORD });
  assert.equal(response.status, 200, `login failed for ${email}: ${response.text}`);

  const setCookie = response.headers["set-cookie"];
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  assert.ok(raw, `set-cookie header missing for ${email}`);

  return raw.split(";")[0] ?? "";
}

function waitForEvent(socket: Socket, event: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), 5000);
    socket.once(event, (payload: Record<string, unknown>) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

async function connectSocket(url: string, cookie: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = createSocketClient(url, {
      path: "/socket.io",
      transports: ["websocket"],
      extraHeaders: { cookie },
      forceNew: true,
    });

    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
  });
}

async function categoryId() {
  const category = await prisma.emergencyCategory.findFirstOrThrow();
  return category.id;
}

type Agent = ReturnType<typeof request.agent>;

async function submitIncident(citizen: Agent) {
  const response = await citizen.post("/api/v1/incidents").send({
    categoryId: await categoryId(),
    description: "Person injured in a road accident near the main gate.",
    contactInformation: "+9779800000000",
    location: { latitude: 27.7172, longitude: 85.324, description: "Main gate" },
  });

  assert.equal(response.status, 201, response.text);
  return response.body.incident as { id: string; referenceNumber: string; status: string };
}

describe("SafeSignal emergency response flow", () => {
  before(async () => {
    await assertIsolatedTestDatabase();
    await resetDatabase();
  });

  beforeEach(async () => {
    await resetRateLimits();
    await resetDatabase();
  });

  after(async () => {
    await closeRedis();
    await prisma.$disconnect();
  });

  it("runs the full flowchart: report, verify, assign, respond, resolve, close", async () => {
    await createUser("DISPATCHER", "dispatcher@test.local");
    const responderUser = await createUser("RESPONDER", "responder@test.local");

    const citizen = request.agent(app);
    const registered = await citizen.post("/api/v1/auth/register").send({
      fullName: "Test Citizen",
      email: "citizen@test.local",
      password: PASSWORD,
    });
    assert.equal(registered.status, 201, registered.text);
    assert.equal(registered.body.user.role, "CITIZEN");

    await citizen.post("/api/v1/auth/login").send({
      email: "citizen@test.local",
      password: PASSWORD,
    });

    const incident = await submitIncident(citizen);
    assert.equal(incident.status, "SUBMITTED");
    assert.match(incident.referenceNumber, /^SS-\d{4}-\d{6}$/);

    const dispatcher = await login("dispatcher@test.local");

    assert.equal(
      (await dispatcher.post(`/api/v1/incidents/${incident.id}/review`)).status,
      200,
    );
    assert.equal(
      (await dispatcher.post(`/api/v1/incidents/${incident.id}/verify`)).status,
      200,
    );

    const priority = await dispatcher
      .patch(`/api/v1/incidents/${incident.id}/priority`)
      .send({ priority: "HIGH" });
    assert.equal(priority.status, 200);
    assert.equal(priority.body.incident.priority, "HIGH");

    const created = await dispatcher.post("/api/v1/assignments").send({
      incidentId: incident.id,
      responderId: responderUser.id,
    });
    assert.equal(created.status, 201, created.text);
    const assignmentId = created.body.assignment.id as string;

    const responder = await login("responder@test.local");

    const accepted = await responder.post(`/api/v1/assignments/${assignmentId}/accept`);
    assert.equal(accepted.status, 200, accepted.text);

    for (const step of ["en-route", "arrived", "in-progress"]) {
      const response = await responder.post(`/api/v1/assignments/${assignmentId}/${step}`);
      assert.equal(response.status, 200, `${step}: ${response.text}`);
    }

    const resolved = await responder
      .post(`/api/v1/assignments/${assignmentId}/resolved`)
      .send({ resolutionNotes: "Casualty handed over to hospital staff." });
    assert.equal(resolved.status, 200, resolved.text);
    assert.equal(resolved.body.assignment.status, "COMPLETED");
    assert.equal(resolved.body.assignment.incident.status, "RESOLVED");

    const closed = await dispatcher.post(`/api/v1/incidents/${incident.id}/close`);
    assert.equal(closed.status, 200, closed.text);
    assert.equal(closed.body.incident.status, "CLOSED");

    const history = await dispatcher.get(`/api/v1/incidents/${incident.id}/history`);
    assert.equal(history.status, 200);
    assert.deepEqual(
      history.body.history.map((entry: { newStatus: string }) => entry.newStatus),
      [
        "SUBMITTED",
        "UNDER_REVIEW",
        "VERIFIED",
        "ASSIGNED",
        "ACCEPTED",
        "EN_ROUTE",
        "ARRIVED",
        "IN_PROGRESS",
        "RESOLVED",
        "CLOSED",
      ],
    );

    const citizenView = await citizen.get(`/api/v1/incidents/${incident.id}`);
    assert.equal(citizenView.status, 200);
    assert.equal(citizenView.body.incident.status, "CLOSED");
  });

  it("rejects a report and prevents dispatch of rejected incidents", async () => {
    await createUser("DISPATCHER", "dispatcher@test.local");
    const responderUser = await createUser("RESPONDER", "responder@test.local");

    const citizen = request.agent(app);
    await citizen.post("/api/v1/auth/register").send({
      fullName: "Reject Citizen",
      email: "reject@test.local",
      password: PASSWORD,
    });
    await citizen
      .post("/api/v1/auth/login")
      .send({ email: "reject@test.local", password: PASSWORD });

    const incident = await submitIncident(citizen);
    const dispatcher = await login("dispatcher@test.local");

    await dispatcher.post(`/api/v1/incidents/${incident.id}/review`);
    const rejected = await dispatcher
      .post(`/api/v1/incidents/${incident.id}/reject`)
      .send({ reason: "Duplicate report, no emergency can be confirmed." });
    assert.equal(rejected.status, 200, rejected.text);
    assert.equal(rejected.body.incident.status, "REJECTED");

    const verifyAfterReject = await dispatcher.post(`/api/v1/incidents/${incident.id}/verify`);
    assert.equal(verifyAfterReject.status, 409);
    assert.equal(verifyAfterReject.body.error.code, "INVALID_TRANSITION");

    const assignRejected = await dispatcher.post("/api/v1/assignments").send({
      incidentId: incident.id,
      responderId: responderUser.id,
    });
    assert.equal(assignRejected.status, 409);
    assert.equal(assignRejected.body.error.code, "INCIDENT_NOT_VERIFIED");
  });

  it("enforces role and ownership rules", async () => {
    const responderUser = await createUser("RESPONDER", "responder@test.local");
    await createUser("DISPATCHER", "dispatcher@test.local");
    await createUser("RESPONDER", "other-responder@test.local");

    const citizen = request.agent(app);
    await citizen.post("/api/v1/auth/register").send({
      fullName: "Guard Citizen",
      email: "guard@test.local",
      password: PASSWORD,
    });
    await citizen
      .post("/api/v1/auth/login")
      .send({ email: "guard@test.local", password: PASSWORD });

    const incident = await submitIncident(citizen);

    const citizenVerify = await citizen.post(`/api/v1/incidents/${incident.id}/verify`);
    assert.equal(citizenVerify.status, 403);

    const dispatcher = await login("dispatcher@test.local");
    await dispatcher.post(`/api/v1/incidents/${incident.id}/review`);
    await dispatcher.post(`/api/v1/incidents/${incident.id}/verify`);

    const created = await dispatcher.post("/api/v1/assignments").send({
      incidentId: incident.id,
      responderId: responderUser.id,
    });
    assert.equal(created.status, 201, created.text);

    const otherResponder = await login("other-responder@test.local");
    const stolen = await otherResponder.post(
      `/api/v1/assignments/${created.body.assignment.id}/accept`,
    );
    assert.equal(stolen.status, 403);

    const otherView = await otherResponder.get(`/api/v1/incidents/${incident.id}`);
    assert.equal(otherView.status, 404);
  });

  it("keeps assignment history when dispatch reassigns", async () => {
    await createUser("DISPATCHER", "dispatcher@test.local");
    const firstResponder = await createUser("RESPONDER", "responder@test.local");
    const secondResponder = await createUser("RESPONDER", "backup@test.local");

    const citizen = request.agent(app);
    await citizen.post("/api/v1/auth/register").send({
      fullName: "Reassign Citizen",
      email: "reassign@test.local",
      password: PASSWORD,
    });
    await citizen
      .post("/api/v1/auth/login")
      .send({ email: "reassign@test.local", password: PASSWORD });

    const incident = await submitIncident(citizen);
    const dispatcher = await login("dispatcher@test.local");

    await dispatcher.post(`/api/v1/incidents/${incident.id}/review`);
    await dispatcher.post(`/api/v1/incidents/${incident.id}/verify`);

    const created = await dispatcher.post("/api/v1/assignments").send({
      incidentId: incident.id,
      responderId: firstResponder.id,
    });

    const reassigned = await dispatcher
      .post(`/api/v1/assignments/${created.body.assignment.id}/reassign`)
      .send({ responderId: secondResponder.id, reason: "First responder went unavailable." });

    assert.equal(reassigned.status, 201, reassigned.text);
    assert.equal(reassigned.body.assignment.status, "PENDING");

    const assignments = await dispatcher.get("/api/v1/assignments");
    const statuses = assignments.body.assignments.map(
      (assignment: { status: string }) => assignment.status,
    );
    assert.ok(statuses.includes("REASSIGNED"));
    assert.ok(statuses.includes("PENDING"));
  });

  it("ignores client-supplied privileged roles on registration", async () => {
    const response = await request(app).post("/api/v1/auth/register").send({
      fullName: "Sneaky User",
      email: "sneaky@test.local",
      password: PASSWORD,
      role: "ADMIN",
    });

    assert.equal(response.status, 201);
    assert.equal(response.body.user.role, "CITIZEN");
  });

  it("pushes realtime events to the dashboards of involved users", async () => {
    await createUser("DISPATCHER", "dispatcher@test.local");
    const responderUser = await createUser("RESPONDER", "responder@test.local");

    await request(app).post("/api/v1/auth/register").send({
      fullName: "Realtime Citizen",
      email: "realtime@test.local",
      password: PASSWORD,
    });

    const dispatcherCookie = await loginCookie("dispatcher@test.local");
    const responderCookie = await loginCookie("responder@test.local");
    const citizenCookie = await loginCookie("realtime@test.local");

    const server = createServer(app);
    initRealtime(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const url = `http://127.0.0.1:${address.port}`;

    const dispatcherSocket = await connectSocket(url, dispatcherCookie);
    const responderSocket = await connectSocket(url, responderCookie);

    try {
      const incidentCreated = waitForEvent(dispatcherSocket, "incident.created");

      const created = await request(app)
        .post("/api/v1/incidents")
        .set("Cookie", citizenCookie)
        .send({
          categoryId: await categoryId(),
          description: "Realtime test incident near the hospital gate.",
          contactInformation: "+9779800000000",
        });

      assert.equal(created.status, 201, created.text);
      const incidentId = created.body.incident.id as string;

      const createdPayload = await incidentCreated;
      assert.equal(createdPayload.incidentId, incidentId);
      assert.equal(createdPayload.status, "SUBMITTED");

      const assignmentCreated = waitForEvent(responderSocket, "assignment.created");

      await request(app).post(`/api/v1/incidents/${incidentId}/review`).set("Cookie", dispatcherCookie);
      await request(app).post(`/api/v1/incidents/${incidentId}/verify`).set("Cookie", dispatcherCookie);
      const assignmentResponse = await request(app)
        .post("/api/v1/assignments")
        .set("Cookie", dispatcherCookie)
        .send({ incidentId, responderId: responderUser.id });

      assert.equal(assignmentResponse.status, 201, assignmentResponse.text);
      const assignmentPayload = await assignmentCreated;
      assert.equal(assignmentPayload.incidentId, incidentId);

      await assert.rejects(() => connectSocket(url, "safesignal_session=invalid"));
    } finally {
      dispatcherSocket.close();
      responderSocket.close();
      await closeRealtime();
    }
  });

  it("pushes responder availability changes to dispatchers", async () => {
    await createUser("DISPATCHER", "dispatcher@test.local");
    const responderUser = await createUser("RESPONDER", "responder@test.local");

    const dispatcherCookie = await loginCookie("dispatcher@test.local");
    const responderCookie = await loginCookie("responder@test.local");

    const server = createServer(app);
    initRealtime(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const url = `http://127.0.0.1:${address.port}`;

    const dispatcherSocket = await connectSocket(url, dispatcherCookie);

    try {
      const availabilityEvent = waitForEvent(
        dispatcherSocket,
        "responder.availability_updated",
      );

      const response = await request(app)
        .patch("/api/v1/responders/me/availability")
        .set("Cookie", responderCookie)
        .send({ availabilityStatus: "BUSY" });

      assert.equal(response.status, 200, response.text);

      const payload = await availabilityEvent;
      assert.equal(payload.responderId, responderUser.id);
      assert.equal(payload.availabilityStatus, "BUSY");
      assert.equal(payload.fullName, "RESPONDER User");
    } finally {
      dispatcherSocket.close();
      await closeRealtime();
    }
  });

  it("blocks cross-origin and token-less browser mutations", async () => {
    await request(app).post("/api/v1/auth/register").send({
      fullName: "CSRF Citizen",
      email: "csrf@test.local",
      password: PASSWORD,
    });

    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "csrf@test.local", password: PASSWORD });
    assert.equal(login.status, 200, login.text);

    const setCookie = login.headers["set-cookie"] as unknown as string[];
    const sessionCookie = setCookie
      .find((cookie) => cookie.startsWith("safesignal_session="))
      ?.split(";")[0];
    const csrfCookie = setCookie
      .find((cookie) => cookie.startsWith("safesignal_csrf="))
      ?.split(";")[0];

    assert.ok(sessionCookie, "session cookie missing");
    assert.ok(csrfCookie, "csrf cookie missing");

    const csrfToken = decodeURIComponent(csrfCookie.slice(csrfCookie.indexOf("=") + 1));
    const payload = {
      categoryId: await categoryId(),
      description: "CSRF probe incident near the hospital gate.",
    };

    const missingToken = await request(app)
      .post("/api/v1/incidents")
      .set("Cookie", sessionCookie)
      .set("Origin", "http://127.0.0.1:5174")
      .send(payload);
    assert.equal(missingToken.status, 403);
    assert.equal(missingToken.body.error.code, "CSRF_TOKEN_INVALID");

    const foreignOrigin = await request(app)
      .post("/api/v1/incidents")
      .set("Cookie", `${sessionCookie}; ${csrfCookie}`)
      .set("Origin", "http://evil.example")
      .set("x-csrf-token", csrfToken)
      .send(payload);
    assert.equal(foreignOrigin.status, 403);
    assert.equal(foreignOrigin.body.error.code, "CSRF_ORIGIN_REJECTED");

    const valid = await request(app)
      .post("/api/v1/incidents")
      .set("Cookie", `${sessionCookie}; ${csrfCookie}`)
      .set("Origin", "http://127.0.0.1:5174")
      .set("x-csrf-token", csrfToken)
      .send(payload);
    assert.equal(valid.status, 201, valid.text);
  });

  it("rate limits repeated login attempts", async () => {
    await createUser("DISPATCHER", "dispatcher@test.local");
    await resetRateLimits();

    let status = 0;
    for (let attempt = 0; attempt < 21; attempt += 1) {
      const response = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "dispatcher@test.local", password: "WrongPassword123!" });

      if (attempt === 0) {
        assert.equal(response.status, 401);
      }
      status = response.status;
    }

    assert.equal(status, 429);
    await resetRateLimits();
  });

  it("adds security headers, restricts CORS, and audits auth events", async () => {
    await createUser("DISPATCHER", "dispatcher@test.local");

    const loginResponse = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "dispatcher@test.local", password: PASSWORD });
    assert.equal(loginResponse.status, 200, loginResponse.text);
    assert.equal(loginResponse.headers["x-content-type-options"], "nosniff");
    assert.equal(loginResponse.headers["x-frame-options"], "DENY");
    assert.equal(loginResponse.headers["referrer-policy"], "no-referrer");
    assert.match(
      String(loginResponse.headers["content-security-policy"]),
      /default-src 'none'/,
    );

    const preflight = await request(app)
      .options("/api/v1/incidents")
      .set("Origin", "http://127.0.0.1:5174")
      .set("Access-Control-Request-Method", "POST");
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers["access-control-allow-origin"], "http://127.0.0.1:5174");
    assert.equal(preflight.headers["access-control-allow-credentials"], "true");
    assert.match(String(preflight.headers["access-control-allow-headers"]), /x-csrf-token/);

    const foreignPreflight = await request(app)
      .options("/api/v1/incidents")
      .set("Origin", "http://evil.example")
      .set("Access-Control-Request-Method", "POST");
    assert.equal(foreignPreflight.headers["access-control-allow-origin"], undefined);

    const failed = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "dispatcher@test.local", password: "WrongPassword123!" });
    assert.equal(failed.status, 401);

    const agent = await login("dispatcher@test.local");
    await agent.post("/api/v1/auth/logout");

    const recorded = (
      await prisma.auditLog.findMany({ orderBy: { createdAt: "asc" } })
    ).map((entry) => entry.action);

    assert.ok(recorded.includes("auth.login_failed"));
    assert.ok(recorded.includes("auth.login"));
    assert.ok(recorded.includes("auth.logout"));
  });

  it("uses the forwarded client ip behind a trusted proxy", async () => {
    await createUser("DISPATCHER", "dispatcher@test.local");
    await resetRateLimits();

    const loginAttempt = (forwardedFor: string) =>
      request(app)
        .post("/api/v1/auth/login")
        .set("X-Forwarded-For", forwardedFor)
        .send({ email: "dispatcher@test.local", password: "WrongPassword123!" });

    let status = 0;
    for (let attempt = 0; attempt < 21; attempt += 1) {
      status = (await loginAttempt("203.0.113.7")).status;
    }

    assert.equal(status, 429, "proxied client should hit its own rate-limit bucket");

    const otherClient = await loginAttempt("203.0.113.8");
    assert.equal(otherClient.status, 401, "a different forwarded ip keeps its own bucket");

    await resetRateLimits();
  });

  it("sets secure cookie attributes for the session and csrf cookies", async () => {
    await createUser("DISPATCHER", "dispatcher@test.local");

    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "dispatcher@test.local", password: PASSWORD });
    assert.equal(response.status, 200, response.text);

    const cookies = response.headers["set-cookie"] as unknown as string[];
    const sessionCookie = cookies.find((cookie) => cookie.startsWith("safesignal_session=")) ?? "";
    const csrfCookie = cookies.find((cookie) => cookie.startsWith("safesignal_csrf=")) ?? "";

    assert.match(sessionCookie, /HttpOnly/i);
    assert.match(sessionCookie, /SameSite=Lax/i);
    assert.match(sessionCookie, /Path=\//i);

    // The CSRF cookie must stay readable by the SPA.
    assert.doesNotMatch(csrfCookie, /HttpOnly/i);
    assert.match(csrfCookie, /SameSite=Lax/i);

    // Development runs over http, so Secure must not be forced here.
    assert.doesNotMatch(sessionCookie, /Secure/i);
  });

  it("stores notifications, enforces ownership, and tracks read state", async () => {
    await createUser("DISPATCHER", "dispatcher@test.local");
    const responderUser = await createUser("RESPONDER", "responder@test.local");

    const citizen = request.agent(app);
    await citizen.post("/api/v1/auth/register").send({
      fullName: "Notify Citizen",
      email: "notify@test.local",
      password: PASSWORD,
    });
    await citizen
      .post("/api/v1/auth/login")
      .send({ email: "notify@test.local", password: PASSWORD });

    const incident = await submitIncident(citizen);

    const dispatcher = await login("dispatcher@test.local");
    const dispatcherList = await dispatcher.get("/api/v1/notifications");
    assert.equal(dispatcherList.status, 200, dispatcherList.text);
    assert.equal(dispatcherList.body.notifications.length, 1);
    assert.equal(dispatcherList.body.notifications[0].type, "INCIDENT_SUBMITTED");
    assert.equal(dispatcherList.body.notifications[0].isRead, false);
    assert.equal(
      dispatcherList.body.pagination.totalItems,
      1,
      "pagination metadata should be returned",
    );

    const dispatcherUnread = await dispatcher.get("/api/v1/notifications/unread-count");
    assert.equal(dispatcherUnread.body.unreadCount, 1);

    const citizenList = await citizen.get("/api/v1/notifications");
    assert.equal(citizenList.body.notifications.length, 1);
    const citizenNotificationId = citizenList.body.notifications[0].id as string;

    // Another user's notification id must not be readable.
    const stolen = await dispatcher.patch(
      `/api/v1/notifications/${citizenNotificationId}/read`,
    );
    assert.equal(stolen.status, 404);

    const marked = await citizen.patch(
      `/api/v1/notifications/${citizenNotificationId}/read`,
    );
    assert.equal(marked.status, 200, marked.text);
    assert.equal(marked.body.notification.isRead, true);

    await dispatcher.post(`/api/v1/incidents/${incident.id}/review`);
    await dispatcher.post(`/api/v1/incidents/${incident.id}/verify`);

    const created = await dispatcher.post("/api/v1/assignments").send({
      incidentId: incident.id,
      responderId: responderUser.id,
    });
    assert.equal(created.status, 201, created.text);

    const responder = await login("responder@test.local");
    const responderList = await responder.get("/api/v1/notifications");
    assert.equal(responderList.body.notifications.length, 1);
    assert.equal(responderList.body.notifications[0].type, "ASSIGNMENT_CREATED");

    await responder.post(`/api/v1/assignments/${created.body.assignment.id}/accept`);
    const dispatcherUnreadList = await dispatcher.get("/api/v1/notifications?isRead=false");
    const types = dispatcherUnreadList.body.notifications.map(
      (notification: { type: string }) => notification.type,
    );
    assert.ok(types.includes("ASSIGNMENT_ACCEPTED"));

    const readAll = await citizen.patch("/api/v1/notifications/read-all");
    assert.equal(readAll.status, 200);
    const citizenUnread = await citizen.get("/api/v1/notifications/unread-count");
    assert.equal(citizenUnread.body.unreadCount, 0);
  });

  it("paginates incident lists with stable metadata", async () => {
    await request(app).post("/api/v1/auth/register").send({
      fullName: "Paging Citizen",
      email: "paging@test.local",
      password: PASSWORD,
    });
    const citizen = await login("paging@test.local");

    for (let index = 0; index < 3; index += 1) {
      await submitIncident(citizen);
    }

    const firstPage = await citizen.get("/api/v1/incidents?page=1&limit=2");
    assert.equal(firstPage.status, 200, firstPage.text);
    assert.equal(firstPage.body.incidents.length, 2);
    assert.deepEqual(firstPage.body.pagination, {
      page: 1,
      limit: 2,
      totalItems: 3,
      totalPages: 2,
    });

    const secondPage = await citizen.get("/api/v1/incidents?page=2&limit=2");
    assert.equal(secondPage.status, 200, secondPage.text);
    assert.equal(secondPage.body.incidents.length, 1);
    assert.equal(secondPage.body.pagination.totalItems, 3);

    const ids = new Set(
      [...firstPage.body.incidents, ...secondPage.body.incidents].map(
        (incident: { id: string }) => incident.id,
      ),
    );
    assert.equal(ids.size, 3, "pages must not repeat incidents");

    const invalidLimit = await citizen.get("/api/v1/incidents?limit=0");
    assert.equal(invalidLimit.status, 400, "invalid page size must be rejected");
  });

  it("filters incident queues by search, priority and category", async () => {
    const reporter = await createUser("CITIZEN", "filter@test.local");
    const medical = await prisma.emergencyCategory.findFirstOrThrow();
    const fire = await prisma.emergencyCategory.create({ data: { name: "Fire Emergency" } });

    await prisma.incident.create({
      data: {
        referenceNumber: "SS-FILTER-1",
        citizenId: reporter.id,
        categoryId: medical.id,
        description: "Road accident near the community school",
        priority: "HIGH",
      },
    });
    await prisma.incident.create({
      data: {
        referenceNumber: "SS-FILTER-2",
        citizenId: reporter.id,
        categoryId: fire.id,
        description: "Kitchen fire in the apartment block",
        priority: "LOW",
      },
    });

    const citizen = await login("filter@test.local");

    const bySearch = await citizen.get("/api/v1/incidents?search=kitchen");
    assert.equal(bySearch.status, 200, bySearch.text);
    assert.equal(bySearch.body.pagination.totalItems, 1);
    assert.equal(bySearch.body.incidents[0].referenceNumber, "SS-FILTER-2");

    const byReference = await citizen.get("/api/v1/incidents?search=ss-filter-1");
    assert.equal(byReference.body.pagination.totalItems, 1);
    assert.equal(byReference.body.incidents[0].referenceNumber, "SS-FILTER-1");

    const byCategory = await citizen.get(`/api/v1/incidents?categoryId=${fire.id}`);
    assert.equal(byCategory.body.pagination.totalItems, 1);
    assert.equal(byCategory.body.incidents[0].referenceNumber, "SS-FILTER-2");

    const byPriority = await citizen.get("/api/v1/incidents?priority=HIGH");
    assert.equal(byPriority.body.pagination.totalItems, 1);
    assert.equal(byPriority.body.incidents[0].referenceNumber, "SS-FILTER-1");

    const noMatch = await citizen.get("/api/v1/incidents?search=no-such-incident");
    assert.equal(noMatch.body.pagination.totalItems, 0);
    assert.equal(noMatch.body.incidents.length, 0);
  });

  it("scopes incident reports by role and summarises lifecycle data", async () => {
    const reporter = await createUser("CITIZEN", "reporter@test.local");
    await createUser("DISPATCHER", "dispatcher@test.local");
    await createUser("RESPONDER", "responder@test.local");

    const citizen = await login("reporter@test.local");
    await submitIncident(citizen);

    const resolvedAt = new Date();
    await prisma.incident.create({
      data: {
        referenceNumber: "SS-REPORT-1",
        citizenId: reporter.id,
        categoryId: await categoryId(),
        description: "Resolved incident used to verify report statistics.",
        status: "RESOLVED",
        priority: "HIGH",
        createdAt: new Date(resolvedAt.getTime() - 45 * 60 * 1000),
        resolvedAt,
      },
    });

    const citizenStats = await citizen.get("/api/v1/incidents/stats");
    assert.equal(citizenStats.status, 200, citizenStats.text);
    assert.equal(citizenStats.body.stats.total, 2);
    // RESOLVED incidents stay active until dispatch closes them.
    assert.equal(citizenStats.body.stats.active, 2);
    assert.equal(citizenStats.body.stats.resolved, 1);
    assert.equal(citizenStats.body.stats.averageResolutionMinutes, 45);
    assert.equal(
      citizenStats.body.stats.byStatus.find(
        (row: { status: string }) => row.status === "SUBMITTED",
      ).count,
      1,
    );
    assert.equal(citizenStats.body.stats.byPriority.length, 4);
    assert.equal(citizenStats.body.stats.byCategory[0].name, "Medical Emergency");
    assert.equal(citizenStats.body.stats.byCategory[0].count, 2);
    assert.equal(citizenStats.body.stats.recent.length, 2);

    const dispatcher = await login("dispatcher@test.local");
    const dispatcherStats = await dispatcher.get("/api/v1/incidents/stats");
    assert.equal(dispatcherStats.status, 200, dispatcherStats.text);
    assert.equal(dispatcherStats.body.stats.total, 2);

    // A responder has no assignments yet, so no incidents are in their scope.
    const responder = await login("responder@test.local");
    const responderStats = await responder.get("/api/v1/incidents/stats");
    assert.equal(responderStats.status, 200, responderStats.text);
    assert.equal(responderStats.body.stats.total, 0);

    const anonymous = await request(app).get("/api/v1/incidents/stats");
    assert.equal(anonymous.status, 401, "report statistics must require authentication");
  });

  it("paginates and filters the admin user list", async () => {
    await createUser("ADMIN", "admin@test.local");
    await createUser("CITIZEN", "citizen1@test.local");
    await createUser("CITIZEN", "citizen2@test.local");
    await createUser("RESPONDER", "responder@test.local");

    const admin = await login("admin@test.local");

    const firstPage = await admin.get("/api/v1/admin/users?page=1&limit=2");
    assert.equal(firstPage.status, 200, firstPage.text);
    assert.equal(firstPage.body.users.length, 2);
    assert.deepEqual(firstPage.body.pagination, {
      page: 1,
      limit: 2,
      totalItems: 4,
      totalPages: 2,
    });

    const secondPage = await admin.get("/api/v1/admin/users?page=2&limit=2");
    assert.equal(secondPage.status, 200, secondPage.text);
    assert.equal(secondPage.body.users.length, 2);

    const ids = new Set(
      [...firstPage.body.users, ...secondPage.body.users].map((user: { id: string }) => user.id),
    );
    assert.equal(ids.size, 4, "pages must not repeat users");

    const citizens = await admin.get("/api/v1/admin/users?role=CITIZEN&page=1&limit=1");
    assert.equal(citizens.status, 200, citizens.text);
    assert.equal(citizens.body.users.length, 1);
    assert.equal(citizens.body.users[0].role.name, "CITIZEN");
    assert.equal(citizens.body.pagination.totalItems, 2);
    assert.equal(citizens.body.pagination.totalPages, 2);

    const oversizedPage = await admin.get("/api/v1/admin/users?limit=100");
    assert.equal(oversizedPage.status, 400, "page size above the maximum must be rejected");

    const anonymous = await request(app).get("/api/v1/admin/users");
    assert.equal(anonymous.status, 401, "admin endpoints must reject anonymous requests");
  });

  it("suspends accounts and exposes filtered, paginated audit logs", async () => {
    const adminUser = await createUser("ADMIN", "admin@test.local");
    const target = await createUser("CITIZEN", "target@test.local");
    await createUser("CITIZEN", "other@test.local");

    const admin = await login("admin@test.local");
    const targetAgent = await login("target@test.local");

    const suspended = await admin
      .patch(`/api/v1/admin/users/${target.id}/status`)
      .send({ accountStatus: "SUSPENDED" });
    assert.equal(suspended.status, 200, suspended.text);
    assert.equal(suspended.body.user.accountStatus, "SUSPENDED");

    // Suspension revokes active sessions, so the old cookie is no longer valid.
    const existingSession = await targetAgent.get("/api/v1/auth/me");
    assert.equal(existingSession.status, 401, "suspension must revoke active sessions");
    assert.equal(existingSession.body.error.code, "UNAUTHENTICATED");

    const blockedLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "target@test.local", password: PASSWORD });
    assert.equal(blockedLogin.status, 403);
    assert.equal(blockedLogin.body.error.code, "ACCOUNT_INACTIVE");

    const selfChange = await admin
      .patch(`/api/v1/admin/users/${adminUser.id}/status`)
      .send({ accountStatus: "SUSPENDED" });
    assert.equal(selfChange.status, 400);
    assert.equal(selfChange.body.error.code, "SELF_STATUS_CHANGE");

    const reactivated = await admin
      .patch(`/api/v1/admin/users/${target.id}/status`)
      .send({ accountStatus: "ACTIVE" });
    assert.equal(reactivated.status, 200, reactivated.text);
    assert.equal(reactivated.body.user.accountStatus, "ACTIVE");

    await admin.patch(`/api/v1/admin/users/${target.id}/role`).send({ role: "RESPONDER" });

    const statusAudit = await admin.get(
      "/api/v1/admin/audit-logs?action=admin.user_status_changed&page=1&limit=1",
    );
    assert.equal(statusAudit.status, 200, statusAudit.text);
    assert.equal(statusAudit.body.pagination.totalItems, 2);
    assert.equal(statusAudit.body.pagination.totalPages, 2);
    assert.equal(statusAudit.body.logs.length, 1);
    assert.equal(statusAudit.body.logs[0].action, "admin.user_status_changed");
    assert.equal(statusAudit.body.logs[0].actor.email, "admin@test.local");
    assert.equal(statusAudit.body.logs[0].metadata.accountStatus, "ACTIVE");

    const secondAuditPage = await admin.get(
      "/api/v1/admin/audit-logs?action=admin.user_status_changed&page=2&limit=1",
    );
    assert.equal(secondAuditPage.body.logs.length, 1);
    assert.equal(secondAuditPage.body.logs[0].metadata.accountStatus, "SUSPENDED");

    const roleAudit = await admin.get(
      "/api/v1/admin/audit-logs?action=admin.user_role_changed",
    );
    assert.equal(roleAudit.body.pagination.totalItems, 1);
    assert.equal(roleAudit.body.logs[0].metadata.role, "RESPONDER");

    const anonymous = await request(app).get("/api/v1/admin/audit-logs");
    assert.equal(anonymous.status, 401, "audit logs must reject anonymous requests");
  });
});
