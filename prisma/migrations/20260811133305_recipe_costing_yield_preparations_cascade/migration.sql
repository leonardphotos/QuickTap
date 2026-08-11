-- AlterTable
ALTER TABLE "inventory_items" ADD COLUMN     "correctionPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "yieldPercent" DECIMAL(5,2) NOT NULL DEFAULT 100;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "recipeBufferPercent" DECIMAL(5,2) NOT NULL DEFAULT 10,
ADD COLUMN     "recipeTargetFoodCostPercent" DECIMAL(5,2) NOT NULL DEFAULT 40;

-- AlterTable
ALTER TABLE "recipe_ingredients" ADD COLUMN     "preparationId" TEXT,
ALTER COLUMN "inventoryItemId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "preparations" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "yieldQuantity" DECIMAL(12,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "preparations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preparation_ingredients" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "preparationId" TEXT NOT NULL,
    "inventoryItemId" TEXT,
    "componentPreparationId" TEXT,
    "quantity" DECIMAL(12,3) NOT NULL,
    "costBase" DECIMAL(12,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "preparation_ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "preparations_restaurantId_idx" ON "preparations"("restaurantId");

-- CreateIndex
CREATE INDEX "preparation_ingredients_restaurantId_preparationId_idx" ON "preparation_ingredients"("restaurantId", "preparationId");

-- CreateIndex
CREATE INDEX "preparation_ingredients_inventoryItemId_idx" ON "preparation_ingredients"("inventoryItemId");

-- CreateIndex
CREATE INDEX "preparation_ingredients_componentPreparationId_idx" ON "preparation_ingredients"("componentPreparationId");

-- CreateIndex
CREATE INDEX "recipe_ingredients_preparationId_idx" ON "recipe_ingredients"("preparationId");

-- AddForeignKey
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_preparationId_fkey" FOREIGN KEY ("preparationId") REFERENCES "preparations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preparations" ADD CONSTRAINT "preparations_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preparation_ingredients" ADD CONSTRAINT "preparation_ingredients_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preparation_ingredients" ADD CONSTRAINT "preparation_ingredients_preparationId_fkey" FOREIGN KEY ("preparationId") REFERENCES "preparations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preparation_ingredients" ADD CONSTRAINT "preparation_ingredients_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preparation_ingredients" ADD CONSTRAINT "preparation_ingredients_componentPreparationId_fkey" FOREIGN KEY ("componentPreparationId") REFERENCES "preparations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
