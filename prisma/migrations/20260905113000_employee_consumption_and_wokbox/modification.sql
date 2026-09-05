ALTER TABLE "orders"
  ADD COLUMN "isEmployeeConsumption" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "employeeConsumerName" TEXT;

CREATE INDEX "orders_restaurantId_isEmployeeConsumption_idx"
  ON "orders"("restaurantId", "isEmployeeConsumption");

-- WokBox: la preparación del Noodle Bar debe guiarse en el orden de armado.
UPDATE "product_modifier_categories" pmc
SET "priority" = CASE lower(mc.name)
  WHEN 'carbohidratos' THEN 10
  WHEN 'proteina' THEN 20
  WHEN 'racion de vegetales' THEN 30
  WHEN 'salsa' THEN 40
  WHEN 'topping' THEN 50
  ELSE pmc."priority"
END
FROM "products" p, "modifier_categories" mc, "restaurants" r
WHERE pmc."productId" = p.id
  AND pmc."modifierCategoryId" = mc.id
  AND p."restaurantId" = r.id
  AND r.name = 'WokBox'
  AND p.name = 'Noodle Bar';

-- Mantiene la proteína incluida separada de la adicional, con los mismos precios actuales.
-- La categoría adicional queda opcional y no altera la selección que ya incluía el plato.
INSERT INTO "modifier_categories" (id, "restaurantId", name, "isRequired", "allowMultiple", "maxSelections", "minSelections", priority, "createdAt", "updatedAt")
SELECT 'proteina-extra-' || md5(mc.id), mc."restaurantId", 'Proteínas adicionales', false, true, NULL, NULL, 25, now(), now()
FROM "modifier_categories" mc
JOIN "restaurants" r ON r.id = mc."restaurantId"
WHERE r.name = 'WokBox' AND mc.name = 'Proteina'
  AND NOT EXISTS (SELECT 1 FROM "modifier_categories" e WHERE e."restaurantId" = mc."restaurantId" AND e.name = 'Proteínas adicionales');

INSERT INTO "modifiers" (id, "restaurantId", "categoryId", name, "priceBase", "costBase", "discountBase", "isAvailable", "maxQuantity", sku, "inventoryItemId", "preparationId", "inventoryQuantity", priority, "createdAt", "updatedAt")
SELECT 'proteina-extra-mod-' || md5(m.id), m."restaurantId", extra.id, m.name, m."priceBase", m."costBase", m."discountBase", m."isAvailable", m."maxQuantity", m.sku, m."inventoryItemId", m."preparationId", m."inventoryQuantity", m.priority, now(), now()
FROM "modifiers" m
JOIN "modifier_categories" normal ON normal.id = m."categoryId" AND normal.name = 'Proteina'
JOIN "modifier_categories" extra ON extra."restaurantId" = m."restaurantId" AND extra.name = 'Proteínas adicionales'
JOIN "restaurants" r ON r.id = m."restaurantId"
WHERE r.name = 'WokBox'
  AND NOT EXISTS (SELECT 1 FROM "modifiers" x WHERE x."categoryId" = extra.id AND x.name = m.name);

INSERT INTO "product_modifier_categories" (id, "productId", "modifierCategoryId", priority)
SELECT 'noodle-extra-' || md5(p.id), p.id, extra.id, 25
FROM "products" p
JOIN "restaurants" r ON r.id = p."restaurantId"
JOIN "modifier_categories" extra ON extra."restaurantId" = p."restaurantId" AND extra.name = 'Proteínas adicionales'
WHERE r.name = 'WokBox' AND p.name = 'Noodle Bar'
  AND NOT EXISTS (SELECT 1 FROM "product_modifier_categories" pmc WHERE pmc."productId" = p.id AND pmc."modifierCategoryId" = extra.id);
