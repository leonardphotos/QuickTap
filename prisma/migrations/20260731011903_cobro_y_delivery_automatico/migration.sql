-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "deliveryAutoAssignOnPaid" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "deliveryAutoOpenOnPaid" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "additional_charges" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "amountUsd" DECIMAL(10,2) NOT NULL,
    "description" TEXT NOT NULL,
    "chargedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "additional_charges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "additional_charges_restaurantId_chargedAt_idx" ON "additional_charges"("restaurantId", "chargedAt");

-- AddForeignKey
ALTER TABLE "additional_charges" ADD CONSTRAINT "additional_charges_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
