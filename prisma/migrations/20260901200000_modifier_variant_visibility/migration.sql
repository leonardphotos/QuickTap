-- En qué variantes de un producto aparece UN MODIFICADOR individual (no todo el grupo, ver
-- ProductModifierCategory.variantIds para eso). Ata modifierId + productId porque una misma
-- ModifierCategory/Modifier se reutiliza entre productos, cada uno con sus propias variantes.
CREATE TABLE "modifier_variant_visibility" (
    "id" TEXT NOT NULL,
    "modifierId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantIds" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "modifier_variant_visibility_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "modifier_variant_visibility_modifierId_productId_key" ON "modifier_variant_visibility"("modifierId", "productId");

ALTER TABLE "modifier_variant_visibility" ADD CONSTRAINT "modifier_variant_visibility_modifierId_fkey" FOREIGN KEY ("modifierId") REFERENCES "modifiers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "modifier_variant_visibility" ADD CONSTRAINT "modifier_variant_visibility_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
