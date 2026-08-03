-- Precio propio de un modificador por variante de producto (ej. "Extra queso" cuesta distinto
-- en Pizza Grande que en Pizza Pequeña). Sin fila = usa Modifier.priceBase de siempre.
CREATE TABLE "modifier_variant_prices" (
    "id" TEXT NOT NULL,
    "modifierId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "priceBase" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "modifier_variant_prices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "modifier_variant_prices_modifierId_variantId_key" ON "modifier_variant_prices"("modifierId", "variantId");

CREATE INDEX "modifier_variant_prices_variantId_idx" ON "modifier_variant_prices"("variantId");

ALTER TABLE "modifier_variant_prices" ADD CONSTRAINT "modifier_variant_prices_modifierId_fkey" FOREIGN KEY ("modifierId") REFERENCES "modifiers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "modifier_variant_prices" ADD CONSTRAINT "modifier_variant_prices_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
