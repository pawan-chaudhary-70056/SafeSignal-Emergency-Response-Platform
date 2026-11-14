import { getRedis, closeRedis } from "../src/lib/redis.js";
import { prisma } from "../src/lib/prisma.js";

/**
 * Restores the development database to a clean demo state so the Playwright
 * suite can be rerun without stale incidents or assignments:
 *
 * - Incident, assignment, evidence, notification and audit history are cleared.
 * - Responder availability returns to AVAILABLE.
 * - Demo account identities return to their seeded names and phone numbers.
 * - Rate-limit counters are cleared so a quick rerun is not blocked.
 *
 * Accounts, roles and categories are preserved; reseed them with
 * `npm run db:seed` if needed.
 */
const demoIdentities: Array<{ email: string; fullName: string; phone: string | null }> = [
  { email: "citizen@safesignal.local", fullName: "Demo Citizen", phone: null },
  { email: "dispatcher@safesignal.local", fullName: "Demo Dispatcher", phone: null },
  { email: "responder@safesignal.local", fullName: "Demo Responder", phone: null },
  { email: "backup@safesignal.local", fullName: "Backup Responder", phone: null },
  { email: "admin@safesignal.local", fullName: "Demo Administrator", phone: null },
];

async function main() {
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.evidence.deleteMany(),
    prisma.assignment.deleteMany(),
    prisma.incidentStatusHistory.deleteMany(),
    prisma.incident.deleteMany(),
    prisma.session.deleteMany(),
    prisma.responderProfile.updateMany({
      data: { availabilityStatus: "AVAILABLE", operationalNotes: null },
    }),
  ]);

  for (const identity of demoIdentities) {
    await prisma.user.updateMany({
      where: { email: identity.email },
      data: { fullName: identity.fullName, phone: identity.phone },
    });
  }

  const redis = await getRedis();
  if (redis) {
    try {
      const keys = await redis.keys("safesignal:ratelimit:*");
      if (keys.length > 0) {
        await redis.del(keys);
      }
    } catch (error) {
      console.error("Rate-limit reset failed:", (error as Error).message);
    }
  }

  console.log(
    "Demo data reset: incidents, assignments, notifications, audit logs and rate limits cleared.",
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
    await closeRedis();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    await closeRedis();
    process.exitCode = 1;
  });
