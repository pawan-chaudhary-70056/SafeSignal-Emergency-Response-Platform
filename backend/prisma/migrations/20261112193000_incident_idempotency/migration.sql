-- Add a per-citizen idempotency key so retried emergency reports create one incident.
ALTER TABLE "Incident" ADD COLUMN "idempotencyKey" VARCHAR(64);

-- NULL keys are allowed for legacy rows and callers that do not send the header.
CREATE UNIQUE INDEX "Incident_citizenId_idempotencyKey_key" ON "Incident"("citizenId", "idempotencyKey");
