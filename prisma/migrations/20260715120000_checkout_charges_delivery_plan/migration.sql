-- AlterEnum
ALTER TYPE "SubscriptionPlan" ADD VALUE 'DELIVERY';

-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "serviceChargeEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ivaEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "orderingEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "fullscreenImageEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "fullscreenImageUrl" TEXT;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "serviceChargeBase" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "ivaBase" DECIMAL(12,2) NOT NULL DEFAULT 0;
