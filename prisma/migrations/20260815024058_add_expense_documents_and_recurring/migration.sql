-- CreateEnum
CREATE TYPE "ExpenseDocumentType" AS ENUM ('FISCAL_INVOICE', 'DELIVERY_NOTE');

-- AlterTable
ALTER TABLE "movements" ADD COLUMN     "documentType" "ExpenseDocumentType",
ADD COLUMN     "isRecurring" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "paymentProofImageUrl" TEXT,
ADD COLUMN     "quoteImageUrl" TEXT;
