-- CreateTable
CREATE TABLE "fiscal_invoicing_configs" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "environment" TEXT NOT NULL DEFAULT 'QA',
    "username" TEXT NOT NULL,
    "passwordEncrypted" TEXT NOT NULL,
    "serieStrongId" TEXT,
    "nextDocumentNumberByType" JSONB NOT NULL DEFAULT '{}',
    "accessToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal_invoicing_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_invoices" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "documentNumber" INTEGER NOT NULL,
    "unidigitalStrongId" TEXT,
    "controlNumber" INTEGER,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "rawRequestJson" JSONB,
    "rawResponseJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_invoicing_configs_restaurantId_key" ON "fiscal_invoicing_configs"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_invoices_orderId_key" ON "fiscal_invoices"("orderId");

-- CreateIndex
CREATE INDEX "fiscal_invoices_restaurantId_status_idx" ON "fiscal_invoices"("restaurantId", "status");

-- AddForeignKey
ALTER TABLE "fiscal_invoicing_configs" ADD CONSTRAINT "fiscal_invoicing_configs_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_invoices" ADD CONSTRAINT "fiscal_invoices_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
