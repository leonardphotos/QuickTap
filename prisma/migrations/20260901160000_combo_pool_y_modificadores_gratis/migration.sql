-- Combo "pool escogible": el cliente elige entre un mínimo y un máximo de platos de la lista
-- del combo (en null se mantiene el comportamiento de cantidades fijas de siempre).
ALTER TABLE "products" ADD COLUMN "comboMinSelections" INTEGER;
ALTER TABLE "products" ADD COLUMN "comboMaxSelections" INTEGER;

-- Modificadores gratis por plato: las primeras N unidades del grupo no se cobran.
ALTER TABLE "product_modifier_categories" ADD COLUMN "freeQuantity" INTEGER;
