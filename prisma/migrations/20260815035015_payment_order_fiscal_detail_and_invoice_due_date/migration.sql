-- AlterTable
ALTER TABLE "movements" ADD COLUMN     "invoiceDueDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "payment_orders" ADD COLUMN     "creditNoteBase" DECIMAL(12,2),
ADD COLUMN     "islrRetentionBase" DECIMAL(12,2),
ADD COLUMN     "ivaAmountBase" DECIMAL(12,2),
ADD COLUMN     "ivaRetentionBase" DECIMAL(12,2),
ADD COLUMN     "paidAmountBase" DECIMAL(12,2),
ADD COLUMN     "paidAmountBs" DECIMAL(14,2),
ADD COLUMN     "totalWithIvaBase" DECIMAL(12,2);
