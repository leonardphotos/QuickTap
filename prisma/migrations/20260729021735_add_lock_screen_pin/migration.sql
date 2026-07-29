-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "lockScreenIntervals" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "lockPinHash" TEXT;
