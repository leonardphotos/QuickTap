-- Rediseño del editor de categorías de modificadores: mínimo de selecciones por categoría,
-- tope de repetición por modificador puntual, y SKU interno opcional por modificador.
ALTER TABLE "modifier_categories" ADD COLUMN "minSelections" INTEGER;
ALTER TABLE "modifiers" ADD COLUMN "maxQuantity" INTEGER;
ALTER TABLE "modifiers" ADD COLUMN "sku" TEXT;
