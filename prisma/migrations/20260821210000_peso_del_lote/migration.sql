-- Peso en Kg de cada carga: un rollo se vende por rollo pero se compra por peso.
ALTER TABLE "shop_purchases" ADD COLUMN "weightKg" DOUBLE PRECISION;
