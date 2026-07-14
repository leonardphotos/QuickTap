-- AlterTable
ALTER TABLE "table_sessions" ADD COLUMN     "pinHash" TEXT,
ADD COLUMN     "pinSkipped" BOOLEAN NOT NULL DEFAULT false;

