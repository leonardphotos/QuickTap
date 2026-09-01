-- Un plato de combo puede fijar su tamaño ("2× Noodle Bar 16OZ"). La unicidad pasa a incluir
-- la variante, para que 16OZ y 26OZ del mismo plato convivan en el mismo combo.
ALTER TABLE "combo_components" ADD COLUMN "variantId" TEXT;
ALTER TABLE "combo_components" ADD CONSTRAINT "combo_components_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- Prisma crea la unicidad como índice único, no como constraint.
DROP INDEX "combo_components_productId_componentProductId_key";
CREATE UNIQUE INDEX "combo_components_productId_componentProductId_variantId_key"
  ON "combo_components"("productId", "componentProductId", "variantId");
