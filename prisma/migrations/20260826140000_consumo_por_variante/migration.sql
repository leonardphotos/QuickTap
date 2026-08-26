-- Consumo de insumo por variante del producto: los gramos del modificador cambian con el tamaño.
ALTER TABLE "modifier_variant_prices" ADD COLUMN "inventoryQuantity" DECIMAL(12,4);
