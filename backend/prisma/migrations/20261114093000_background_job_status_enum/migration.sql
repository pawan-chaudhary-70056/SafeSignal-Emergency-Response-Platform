-- CreateEnum
CREATE TYPE "BackgroundJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED');

-- AlterTable: convert the controlled string values into the new enum.
ALTER TABLE "BackgroundJob" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "BackgroundJob"
  ALTER COLUMN "status" TYPE "BackgroundJobStatus"
  USING ("status"::"BackgroundJobStatus");
ALTER TABLE "BackgroundJob" ALTER COLUMN "status" SET DEFAULT 'PENDING';
