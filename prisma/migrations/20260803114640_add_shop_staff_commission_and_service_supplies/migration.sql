-- AlterTable
ALTER TABLE "shop_sale_items" ADD COLUMN     "commissionBase" DOUBLE PRECISION,
ADD COLUMN     "commissionPercent" DOUBLE PRECISION,
ADD COLUMN     "staffUserId" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "commissionPercent" DOUBLE PRECISION,
ADD COLUMN     "isServiceProvider" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "paymentMethodsConfig" JSONB;

-- CreateTable
CREATE TABLE "shop_service_supplies" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "serviceProductId" TEXT NOT NULL,
    "supplyProductId" TEXT NOT NULL,
    "supplyV1" TEXT NOT NULL,
    "supplyV2" TEXT NOT NULL DEFAULT '',
    "quantity" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_service_supplies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shop_service_supplies_restaurantId_idx" ON "shop_service_supplies"("restaurantId");

-- CreateIndex
CREATE INDEX "shop_service_supplies_serviceProductId_idx" ON "shop_service_supplies"("serviceProductId");

-- CreateIndex
CREATE INDEX "shop_sale_items_staffUserId_idx" ON "shop_sale_items"("staffUserId");

-- AddForeignKey
ALTER TABLE "shop_service_supplies" ADD CONSTRAINT "shop_service_supplies_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_service_supplies" ADD CONSTRAINT "shop_service_supplies_serviceProductId_fkey" FOREIGN KEY ("serviceProductId") REFERENCES "shop_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
