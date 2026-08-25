-- Pantalla "Más información" de un evento en la taquilla, y su financiamiento.
ALTER TABLE "shop_products" ADD COLUMN "eventDescription" TEXT;
-- Hasta 5 imágenes del carrusel. La portada del boleto sigue siendo photoUrl.
ALTER TABLE "shop_products" ADD COLUMN "eventImages" JSONB;
-- Cláusulas que el comprador acepta antes de ver el precio.
ALTER TABLE "shop_products" ADD COLUMN "eventTerms" TEXT;

-- Financiamiento: plantilla que el local ofrece, distinta del plan ya pactado de una venta.
ALTER TABLE "shop_products" ADD COLUMN "eventFinancingEnabled" BOOLEAN NOT NULL DEFAULT false;
-- La inicial va en PORCENTAJE del precio, no en monto: así no hay que recalcularla cuando
-- cambia el precio de la entrada.
ALTER TABLE "shop_products" ADD COLUMN "eventDownPercent" DOUBLE PRECISION;
ALTER TABLE "shop_products" ADD COLUMN "eventInstallments" INTEGER;
ALTER TABLE "shop_products" ADD COLUMN "eventFrequency" TEXT;
