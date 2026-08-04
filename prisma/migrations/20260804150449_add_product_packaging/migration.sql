-- AlterTable
ALTER TABLE "inventory_items" ADD COLUMN     "packagingType" TEXT,
ADD COLUMN     "salePriceBase" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "embaseFeeBase" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "packagingFeeBase" DECIMAL(12,2),
ADD COLUMN     "packagingItemId" TEXT,
ADD COLUMN     "packagingMode" TEXT NOT NULL DEFAULT 'NONE';

-- CreateIndex
CREATE INDEX "inventory_items_restaurantId_packagingType_idx" ON "inventory_items"("restaurantId", "packagingType");

-- CreateIndex
CREATE INDEX "products_restaurantId_packagingItemId_idx" ON "products"("restaurantId", "packagingItemId");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_packagingItemId_fkey" FOREIGN KEY ("packagingItemId") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
