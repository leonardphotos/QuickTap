-- Recetas: línea "A elección del cliente" (resuelve el topping según el modificador elegido)
-- y líneas específicas por tamaño (ProductVariant).

-- AlterTable
ALTER TABLE "recipe_ingredients"
  ADD COLUMN "customerChoiceModifierCategoryId" TEXT,
  ADD COLUMN "productVariantId" TEXT;

-- CreateIndex
CREATE INDEX "recipe_ingredients_customerChoiceModifierCategoryId_idx" ON "recipe_ingredients"("customerChoiceModifierCategoryId");

-- CreateIndex
CREATE INDEX "recipe_ingredients_productVariantId_idx" ON "recipe_ingredients"("productVariantId");

-- AddForeignKey
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_customerChoiceModifierCategoryId_fkey" FOREIGN KEY ("customerChoiceModifierCategoryId") REFERENCES "modifier_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
