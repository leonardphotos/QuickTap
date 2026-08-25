-- Fecha límite del financiamiento de un evento: hasta cuándo se acepta y tope de pago.
ALTER TABLE "shop_products" ADD COLUMN "eventFinancingDeadline" TEXT;
