/**
 * Production seed for SafeSignal.
 *
 * Run after `prisma migrate deploy`, for example:
 *
 *   docker compose --profile tools run --rm migrate npx tsx scripts/seed-production.ts
 *
 * This seeder only creates rows that are missing:
 * - the four canonical roles;
 * - the default emergency categories (existing categories are left untouched so
 *   administrator edits survive re-runs);
 * - optionally, one ADMIN account from ADMIN_EMAIL / ADMIN_PASSWORD.
 *
 * It never creates demo accounts and never overwrites an existing password.
 */
import { hashPassword } from "../src/lib/password.js";
import { prisma } from "../src/lib/prisma.js";

const roles = [
  { name: "CITIZEN", description: "Reports emergencies and tracks own incidents" },
  { name: "DISPATCHER", description: "Reviews incidents and coordinates assignments" },
  { name: "RESPONDER", description: "Accepts assignments and updates response progress" },
  { name: "ADMIN", description: "Manages users, roles and emergency categories" },
];

const categories = [
  { name: "Medical Emergency", description: "Injury or urgent medical assistance" },
  { name: "Fire Emergency", description: "Fire, smoke or explosion" },
  { name: "Road Accident", description: "Vehicle collision or road hazard" },
  { name: "Personal Safety", description: "Threat to personal safety" },
  { name: "Rescue Assistance", description: "Trapped or stranded people" },
  { name: "Other Emergency", description: "Any other emergency situation" },
];

async function main() {
  for (const role of roles) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: {},
      create: role,
    });
  }

  for (const category of categories) {
    await prisma.emergencyCategory.upsert({
      where: { name: category.name },
      update: {},
      create: category,
    });
  }

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminFullName = process.env.ADMIN_FULL_NAME?.trim() || "SafeSignal Administrator";

  if (adminEmail || adminPassword) {
    if (!adminEmail || !adminPassword) {
      throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be provided together.");
    }

    if (adminPassword.length < 10) {
      throw new Error("ADMIN_PASSWORD must be at least 10 characters long.");
    }

    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: "ADMIN" } });
    const existing = await prisma.user.findUnique({ where: { email: adminEmail } });

    if (existing) {
      console.log(`Admin account ${adminEmail} already exists; password left unchanged.`);
    } else {
      await prisma.user.create({
        data: {
          email: adminEmail,
          fullName: adminFullName,
          passwordHash: await hashPassword(adminPassword),
          roleId: adminRole.id,
        },
      });
      console.log(`Created admin account ${adminEmail}.`);
    }
  } else {
    console.log("ADMIN_EMAIL / ADMIN_PASSWORD not set; no admin account created.");
  }

  const demoAccounts = await prisma.user.count({
    where: { email: { endsWith: "@safesignal.local" } },
  });

  if (demoAccounts > 0) {
    console.warn(
      `Warning: ${demoAccounts} demo account(s) ending in @safesignal.local exist in this database. Remove them before production use.`,
    );
  }

  const [roleCount, categoryCount] = await Promise.all([
    prisma.role.count(),
    prisma.emergencyCategory.count(),
  ]);

  console.log(`Reference data ready: ${roleCount} roles, ${categoryCount} emergency categories.`);
  console.log("Production seed complete. Demo accounts were not created.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
