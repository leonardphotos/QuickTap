-- Registro de personalizaciones por local (ver modelo Customization).
CREATE TYPE "CustomizationStatus" AS ENUM ('SOLICITADA', 'EN_DESARROLLO', 'ENTREGADA', 'DESCARTADA');

CREATE TABLE "customizations" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "status" "CustomizationStatus" NOT NULL DEFAULT 'SOLICITADA',
    "amountUsd" DECIMAL(10,2) NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "additionalChargeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customizations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customizations_additionalChargeId_key" ON "customizations"("additionalChargeId");
CREATE INDEX "customizations_restaurantId_status_idx" ON "customizations"("restaurantId", "status");

ALTER TABLE "customizations" ADD CONSTRAINT "customizations_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customizations" ADD CONSTRAINT "customizations_additionalChargeId_fkey"
    FOREIGN KEY ("additionalChargeId") REFERENCES "additional_charges"("id") ON DELETE SET NULL ON UPDATE CASCADE;
