-- Topping multi-insumo: una Preparation curada para el picker de Inventario -> Toppings
-- (mismo patrón que InventoryItem.isTopping).
ALTER TABLE "preparations" ADD COLUMN "isTopping" BOOLEAN NOT NULL DEFAULT false;
