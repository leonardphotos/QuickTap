-- Fecha de caducidad de insumos y productos, y stock mínimo por producto.
-- La fecha va como texto "YYYY-MM-DD": guardada como timestamp UTC, un lote que
-- vence "el 3" se leería como el 2 en hora de Caracas (UTC-4).
ALTER TABLE "inventory_items" ADD COLUMN "expiryDate" TEXT;

ALTER TABLE "products" ADD COLUMN "expiryDate" TEXT;
ALTER TABLE "products" ADD COLUMN "stockMinQuantity" INTEGER;
