-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'CASH_USD';

-- AlterTable
ALTER TABLE "order_payments" ADD COLUMN "referenceNumber" TEXT;
