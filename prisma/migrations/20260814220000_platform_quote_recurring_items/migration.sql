-- AlterTable
ALTER TABLE "platform_quotes" ADD COLUMN     "recurringItems" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "recurringTotalUsd" DECIMAL(12,2) NOT NULL DEFAULT 0;

