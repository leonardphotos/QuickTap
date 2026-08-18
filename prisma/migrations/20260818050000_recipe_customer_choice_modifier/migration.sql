-- Recetas: porción propia por topping concreto (además de la genérica por categoría).

-- AlterTable
ALTER TABLE "recipe_ingredients" ADD COLUMN "customerChoiceModifierId" TEXT;

-- CreateIndex
CREATE INDEX "recipe_ingredients_customerChoiceModifierId_idx" ON "recipe_ingredients"("customerChoiceModifierId");

-- AddForeignKey
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_customerChoiceModifierId_fkey" FOREIGN KEY ("customerChoiceModifierId") REFERENCES "modifiers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
