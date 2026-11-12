-- Seeds the four canonical SafeSignal roles (docs/01-project-overview/user-roles-and-core-features.md).
-- Run with: psql "$DATABASE_URL" -f prisma/seed.sql
-- Safe to re-run: existing role names are left untouched.

INSERT INTO "Role" ("id", "name", "description", "createdAt")
VALUES
  (gen_random_uuid(), 'CITIZEN', 'Reports emergencies and tracks own incidents', now()),
  (gen_random_uuid(), 'DISPATCHER', 'Reviews incidents and coordinates responder assignments', now()),
  (gen_random_uuid(), 'RESPONDER', 'Accepts assignments and updates response progress', now()),
  (gen_random_uuid(), 'ADMIN', 'Manages users, roles and emergency categories', now())
ON CONFLICT ("name") DO NOTHING;
