-- AlterTable
ALTER TABLE "modifiers" ADD COLUMN     "inventoryItemId" TEXT,
ADD COLUMN     "inventoryQuantity" DECIMAL(12,4);

-- AlterTable
ALTER TABLE "order_item_modifiers" ADD COLUMN     "modifierId" TEXT;

-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "modifierInventoryLinkEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "modifiers_inventoryItemId_idx" ON "modifiers"("inventoryItemId");

-- AddForeignKey
ALTER TABLE "modifiers" ADD CONSTRAINT "modifiers_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

