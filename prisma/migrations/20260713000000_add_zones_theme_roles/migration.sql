-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "UserRole" ADD VALUE 'ADMIN';
ALTER TYPE "UserRole" ADD VALUE 'CASHIER';
ALTER TYPE "UserRole" ADD VALUE 'WAITER';
ALTER TYPE "UserRole" ADD VALUE 'KITCHEN';

-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "theme" JSONB;

-- AlterTable
ALTER TABLE "tables" ADD COLUMN     "zoneId" TEXT;

-- CreateTable
CREATE TABLE "zones" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "zones_restaurantId_priority_idx" ON "zones"("restaurantId", "priority");

-- CreateIndex
CREATE INDEX "tables_zoneId_idx" ON "tables"("zoneId");

-- AddForeignKey
ALTER TABLE "zones" ADD CONSTRAINT "zones_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tables" ADD CONSTRAINT "tables_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
