-- Estaciones de cocina (ej: "Cocina Caliente", "Repostería", "Bar") para
-- dividir la comanda por estación al momento de cocinar.
CREATE TABLE "kitchens" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kitchens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kitchens_restaurantId_priority_idx" ON "kitchens"("restaurantId", "priority");

-- AddForeignKey
ALTER TABLE "kitchens" ADD CONSTRAINT "kitchens_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: producto -> estación de cocina (opcional)
ALTER TABLE "products" ADD COLUMN "kitchenId" TEXT;

-- CreateIndex
CREATE INDEX "products_restaurantId_kitchenId_idx" ON "products"("restaurantId", "kitchenId");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_kitchenId_fkey" FOREIGN KEY ("kitchenId") REFERENCES "kitchens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: snapshot de cocina + avance de preparación por ítem de la comanda
ALTER TABLE "order_items" ADD COLUMN "kitchenName" TEXT;
ALTER TABLE "order_items" ADD COLUMN "kitchenReadyAt" TIMESTAMP(3);
