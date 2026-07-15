-- CreateEnum
CREATE TYPE "DeliveryPricingMode" AS ENUM ('DISABLED', 'DISTANCE', 'ZONE');

-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "deliveryOriginLat" DOUBLE PRECISION,
ADD COLUMN     "deliveryOriginLng" DOUBLE PRECISION,
ADD COLUMN     "deliveryPricingMode" "DeliveryPricingMode" NOT NULL DEFAULT 'DISABLED',
ADD COLUMN     "deliveryBaseFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "deliveryPricePerKm" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "deliveryFeeBase" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "customerLat" DOUBLE PRECISION,
ADD COLUMN     "customerLng" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "delivery_couriers" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "whatsappPhone" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_couriers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_zones" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "polygon" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_zones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "delivery_couriers_restaurantId_idx" ON "delivery_couriers"("restaurantId");

-- CreateIndex
CREATE INDEX "delivery_zones_restaurantId_idx" ON "delivery_zones"("restaurantId");

-- AddForeignKey
ALTER TABLE "delivery_couriers" ADD CONSTRAINT "delivery_couriers_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_zones" ADD CONSTRAINT "delivery_zones_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
