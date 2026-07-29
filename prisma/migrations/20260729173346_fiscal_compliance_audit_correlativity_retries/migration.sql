-- DropForeignKey
ALTER TABLE "fiscal_invoices" DROP CONSTRAINT "fiscal_invoices_orderId_fkey";

-- DropIndex
DROP INDEX "fiscal_invoices_orderId_key";

-- AlterTable
ALTER TABLE "fiscal_invoices" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "nextRetryAt" TIMESTAMP(3),
ADD COLUMN     "replacesInvoiceId" TEXT,
ADD COLUMN     "voidReason" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "fiscal_invoicing_configs" ADD COLUMN     "igtfEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "igtfRate" DECIMAL(5,4) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "fiscal_audit_logs" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "orderId" TEXT,
    "event" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiscal_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fiscal_audit_logs_restaurantId_createdAt_idx" ON "fiscal_audit_logs"("restaurantId", "createdAt");

-- CreateIndex
CREATE INDEX "fiscal_audit_logs_invoiceId_idx" ON "fiscal_audit_logs"("invoiceId");

-- CreateIndex
CREATE INDEX "fiscal_invoices_status_nextRetryAt_idx" ON "fiscal_invoices"("status", "nextRetryAt");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_invoices_orderId_documentType_key" ON "fiscal_invoices"("orderId", "documentType");

-- AddForeignKey
ALTER TABLE "fiscal_invoices" ADD CONSTRAINT "fiscal_invoices_replacesInvoiceId_fkey" FOREIGN KEY ("replacesInvoiceId") REFERENCES "fiscal_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_invoices" ADD CONSTRAINT "fiscal_invoices_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

