-- CreateEnum
CREATE TYPE "PlatformQuoteStatus" AS ENUM ('PENDING', 'SENT', 'APPROVED');

-- CreateTable
CREATE TABLE "platform_quotes" (
    "id" TEXT NOT NULL,
    "quoteNumber" SERIAL NOT NULL,
    "clientName" TEXT NOT NULL,
    "clientPhone" TEXT NOT NULL,
    "businessName" TEXT,
    "planName" TEXT NOT NULL,
    "planPriceUsd" DECIMAL(12,2) NOT NULL,
    "planCycle" TEXT NOT NULL DEFAULT 'Mensual',
    "items" JSONB NOT NULL DEFAULT '[]',
    "totalUsd" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "status" "PlatformQuoteStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_quotes_quoteNumber_key" ON "platform_quotes"("quoteNumber");

-- CreateIndex
CREATE INDEX "platform_quotes_status_createdAt_idx" ON "platform_quotes"("status", "createdAt");

