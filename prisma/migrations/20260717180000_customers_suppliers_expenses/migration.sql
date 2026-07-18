-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('UTILITIES', 'SUPPLIES', 'RENT', 'PAYROLL', 'ADMINISTRATIVE', 'MARKETING', 'TRANSPORT', 'MAINTENANCE', 'FURNITURE', 'OTHER');

-- AlterTable: descuento por pago (order_payments)
ALTER TABLE "order_payments" ADD COLUMN "discountPercent" DECIMAL(5,2);
ALTER TABLE "order_payments" ADD COLUMN "discountBase" DECIMAL(12,2);

-- AlterTable: módulo de Gastos (movements)
ALTER TABLE "movements" ADD COLUMN "category" "ExpenseCategory";
ALTER TABLE "movements" ADD COLUMN "supplierId" TEXT;
ALTER TABLE "movements" ADD COLUMN "inventoryItemId" TEXT;
ALTER TABLE "movements" ADD COLUMN "inventoryQuantity" DECIMAL(12,2);
ALTER TABLE "movements" ADD COLUMN "isCredit" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "movements" ADD COLUMN "creditPaidAt" TIMESTAMP(3);

-- CreateTable: proveedores
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "taxId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "suppliers_restaurantId_idx" ON "suppliers"("restaurantId");

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: directorio de clientes
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "idNumber" TEXT,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customers_restaurantId_phone_key" ON "customers"("restaurantId", "phone");

-- CreateIndex
CREATE INDEX "customers_restaurantId_name_idx" ON "customers"("restaurantId", "name");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (movements -> suppliers / inventory_items)
ALTER TABLE "movements" ADD CONSTRAINT "movements_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "movements" ADD CONSTRAINT "movements_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "movements_restaurantId_isCredit_creditPaidAt_idx" ON "movements"("restaurantId", "isCredit", "creditPaidAt");
