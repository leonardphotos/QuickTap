-- AlterEnum
ALTER TYPE "PlanRequestStatus" ADD VALUE 'REJECTED';
ALTER TYPE "PlanRequestStatus" ADD VALUE 'PAYMENT_NOT_RECEIVED';

-- CreateEnum
CREATE TYPE "PromoCodeDurationUnit" AS ENUM ('HOUR', 'DAY', 'MONTH', 'YEAR');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "prepTimeMinutes" INTEGER;

-- AlterTable
ALTER TABLE "promo_codes" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "durationValue" INTEGER,
ADD COLUMN     "durationUnit" "PromoCodeDurationUnit";

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "minQuantity" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_items_restaurantId_idx" ON "inventory_items"("restaurantId");

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
