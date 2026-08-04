-- AlterEnum
ALTER TYPE "OrderPaymentVerificationStatus" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "whatsappOrderMode" TEXT NOT NULL DEFAULT 'PAYMENT_VERIFICATION';
