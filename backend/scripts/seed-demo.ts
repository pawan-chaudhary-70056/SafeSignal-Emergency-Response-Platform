import { hashPassword } from "../src/lib/password.js";
import { prisma } from "../src/lib/prisma.js";

const PASSWORD = "Password123!";

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

const demoUsers = [
  { email: "citizen@safesignal.local", fullName: "Demo Citizen", role: "CITIZEN" },
  { email: "dispatcher@safesignal.local", fullName: "Demo Dispatcher", role: "DISPATCHER" },
  { email: "responder@safesignal.local", fullName: "Demo Responder", role: "RESPONDER" },
  { email: "backup@safesignal.local", fullName: "Backup Responder", role: "RESPONDER" },
  { email: "admin@safesignal.local", fullName: "Demo Administrator", role: "ADMIN" },
];

async function main() {
  for (const role of roles) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: { description: role.description },
      create: role,
    });
  }

  for (const category of categories) {
    await prisma.emergencyCategory.upsert({
      where: { name: category.name },
      update: { description: category.description, isActive: true },
      create: category,
    });
  }

  const passwordHash = await hashPassword(PASSWORD);

  for (const demo of demoUsers) {
    const role = await prisma.role.findUniqueOrThrow({ where: { name: demo.role } });

    const user = await prisma.user.upsert({
      where: { email: demo.email },
      update: { passwordHash, roleId: role.id, accountStatus: "ACTIVE" },
      create: {
        email: demo.email,
        fullName: demo.fullName,
        passwordHash,
        roleId: role.id,
      },
    });

    if (demo.role === "RESPONDER") {
      await prisma.responderProfile.upsert({
        where: { userId: user.id },
        update: { availabilityStatus: "AVAILABLE" },
        create: { userId: user.id, responderType: "AMBULANCE" },
      });
    }
  }

  console.log("Seeded roles, categories and demo accounts.");
  console.log(`Login password for every demo account: ${PASSWORD}`);
  console.log(demoUsers.map((user) => `- ${user.role}: ${user.email}`).join("\n"));
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
