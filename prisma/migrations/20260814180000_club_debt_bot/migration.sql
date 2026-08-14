-- CreateEnum
CREATE TYPE "ClubDebtVerificationStatus" AS ENUM ('PENDING_FORWARD', 'AWAITING_VERIFIER', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "whatsappBotDebtRemindersEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "club_debt_reminders" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "lastReminderAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "club_debt_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_debt_payment_verifications" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "studentId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "amountBase" DECIMAL(12,2) NOT NULL,
    "proofImageUrl" TEXT NOT NULL,
    "status" "ClubDebtVerificationStatus" NOT NULL DEFAULT 'AWAITING_VERIFIER',
    "method" "PaymentMethod",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "club_debt_payment_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "club_debt_reminders_restaurantId_source_refId_key" ON "club_debt_reminders"("restaurantId", "source", "refId");

-- CreateIndex
CREATE INDEX "club_debt_payment_verifications_restaurantId_status_idx" ON "club_debt_payment_verifications"("restaurantId", "status");

-- AddForeignKey
ALTER TABLE "club_debt_reminders" ADD CONSTRAINT "club_debt_reminders_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_debt_payment_verifications" ADD CONSTRAINT "club_debt_payment_verifications_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

