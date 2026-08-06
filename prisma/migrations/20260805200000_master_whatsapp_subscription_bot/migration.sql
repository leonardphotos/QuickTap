-- Chatbot de WhatsApp de la plataforma: bienvenida al registrarse + recordatorio de renovación.

-- CreateEnum
CREATE TYPE "SubscriptionPaymentVerificationStatus" AS ENUM ('AWAITING_PROOF', 'PENDING_FORWARD', 'AWAITING_VERIFIER', 'APPROVED', 'REJECTED', 'TIMED_OUT');

-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN "subscriptionReminderForPeriodEnd" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN "masterWhatsappEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "masterWhatsappConnectedNumber" TEXT,
ADD COLUMN "subscriptionVerifierPhone" TEXT;

-- CreateTable
CREATE TABLE "subscription_payment_verifications" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "ownerPhone" TEXT NOT NULL,
    "status" "SubscriptionPaymentVerificationStatus" NOT NULL DEFAULT 'AWAITING_PROOF',
    "plan" "SubscriptionPlan" NOT NULL,
    "billingCycle" "BillingCycle" NOT NULL,
    "amountUsd" DECIMAL(10,2),
    "proofImageUrl" TEXT,
    "proofReceivedAt" TIMESTAMP(3),
    "forwardedToVerifierAt" TIMESTAMP(3),
    "verifierRepliedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_payment_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subscription_payment_verifications_status_idx" ON "subscription_payment_verifications"("status");

-- CreateIndex
CREATE INDEX "subscription_payment_verifications_ownerPhone_status_idx" ON "subscription_payment_verifications"("ownerPhone", "status");

-- AddForeignKey
ALTER TABLE "subscription_payment_verifications" ADD CONSTRAINT "subscription_payment_verifications_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
