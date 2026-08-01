-- CreateEnum
CREATE TYPE "OrderPaymentVerificationStatus" AS ENUM ('AWAITING_PROOF', 'PENDING_FORWARD', 'AWAITING_VERIFIER', 'APPROVED', 'TIMED_OUT');

-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "whatsappBotPaymentVerifierPhone" TEXT;

-- CreateTable
CREATE TABLE "order_payment_verifications" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "status" "OrderPaymentVerificationStatus" NOT NULL DEFAULT 'AWAITING_PROOF',
    "proofImageUrl" TEXT,
    "proofReceivedAt" TIMESTAMP(3),
    "forwardedToVerifierAt" TIMESTAMP(3),
    "verifierRepliedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_payment_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "order_payment_verifications_orderId_key" ON "order_payment_verifications"("orderId");

-- CreateIndex
CREATE INDEX "order_payment_verifications_restaurantId_status_idx" ON "order_payment_verifications"("restaurantId", "status");

-- CreateIndex
CREATE INDEX "order_payment_verifications_restaurantId_customerPhone_stat_idx" ON "order_payment_verifications"("restaurantId", "customerPhone", "status");

-- AddForeignKey
ALTER TABLE "order_payment_verifications" ADD CONSTRAINT "order_payment_verifications_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
