-- AlterTable
ALTER TABLE "inventory_items" ADD COLUMN     "locationScope" TEXT NOT NULL DEFAULT 'LOCAL';

-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "casaMatrizEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "inventoryMode" TEXT NOT NULL DEFAULT 'PER_BRANCH';

-- CreateTable
CREATE TABLE "inventory_transfers" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "fromRestaurantId" TEXT NOT NULL,
    "fromScope" TEXT NOT NULL,
    "fromLocationName" TEXT NOT NULL,
    "toRestaurantId" TEXT NOT NULL,
    "toScope" TEXT NOT NULL,
    "toLocationName" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_transfers_groupId_createdAt_idx" ON "inventory_transfers"("groupId", "createdAt");

-- CreateIndex
CREATE INDEX "inventory_items_restaurantId_locationScope_idx" ON "inventory_items"("restaurantId", "locationScope");
