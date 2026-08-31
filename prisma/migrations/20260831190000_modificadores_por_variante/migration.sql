-- Tamaños (ProductVariant) en los que aparece un grupo de modificadores.
-- Vacío = en todos, que es como se comportaba antes de existir esta columna: los grupos ya
-- asociados siguen saliendo en todas las variantes sin necesidad de tocarlos.
ALTER TABLE "product_modifier_categories"
  ADD COLUMN "variantIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
