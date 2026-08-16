-- Registro de merma: insumos y productos terminados que se perdieron y no se vendieron.

-- CreateEnum
CREATE TYPE "WasteReason" AS ENUM ('EXPIRED', 'DAMAGED', 'PREPARATION', 'CUSTOMER_RETURN', 'SPILLAGE', 'THEFT', 'OTHER');

-- CreateTable
CREATE TABLE "waste_records" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "inventoryItemId" TEXT,
    "productId" TEXT,
    "itemName" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "costBase" DECIMAL(12,2) NOT NULL,
    "reason" "WasteReason" NOT NULL,
    "note" TEXT,
    "stockAdjusted" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT,
    "createdByName" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waste_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "waste_records_restaurantId_occurredAt_idx" ON "waste_records"("restaurantId", "occurredAt");

-- CreateIndex
CREATE INDEX "waste_records_restaurantId_productId_idx" ON "waste_records"("restaurantId", "productId");

-- CreateIndex
CREATE INDEX "waste_records_restaurantId_inventoryItemId_idx" ON "waste_records"("restaurantId", "inventoryItemId");

-- AddForeignKey
ALTER TABLE "waste_records" ADD CONSTRAINT "waste_records_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waste_records" ADD CONSTRAINT "waste_records_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waste_records" ADD CONSTRAINT "waste_records_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
