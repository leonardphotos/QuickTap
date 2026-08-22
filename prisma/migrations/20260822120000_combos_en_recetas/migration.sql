-- Combos: una línea de receta puede ser otro plato completo (ver RecipeIngredient.componentProductId).
ALTER TABLE "recipe_ingredients" ADD COLUMN "componentProductId" TEXT;
CREATE INDEX "recipe_ingredients_componentProductId_idx" ON "recipe_ingredients"("componentProductId");
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_componentProductId_fkey"
    FOREIGN KEY ("componentProductId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
