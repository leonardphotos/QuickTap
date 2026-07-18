-- Costo por unidad del insumo, para calcular automáticamente el costo de receta.
ALTER TABLE "inventory_items" ADD COLUMN "pricePerUnitBase" DECIMAL(14,4);
