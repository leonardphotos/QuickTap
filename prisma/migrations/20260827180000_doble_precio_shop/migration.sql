-- Doble precio en Locales Comerciales: tasa propia para Pago Móvil/Transferencia en el POS.
ALTER TABLE "restaurants" ADD COLUMN "shopBsSaleRate" DECIMAL(12,4);
