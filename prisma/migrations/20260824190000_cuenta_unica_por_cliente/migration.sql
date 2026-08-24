-- Cuenta única por cliente en cada negocio: una venta fiada deja de ser un ticket cerrado y
-- pasa a ser una cuenta que crece (ver shop.service.ts -> recordSale). Cada línea necesita su
-- propia fecha, porque ShopSale.time ya solo dice cuándo se ABRIÓ la cuenta.
--
-- Las líneas que ya existen toman la fecha de su venta, que es exactamente cuándo se
-- compraron: hasta ahora cada venta era una sola compra.
ALTER TABLE "shop_sale_items" ADD COLUMN "addedAt" TIMESTAMP(3);

UPDATE "shop_sale_items" i
SET "addedAt" = s."time"
FROM "shop_sales" s
WHERE i."saleId" = s."id" AND i."addedAt" IS NULL;

ALTER TABLE "shop_sale_items" ALTER COLUMN "addedAt" SET NOT NULL;
ALTER TABLE "shop_sale_items" ALTER COLUMN "addedAt" SET DEFAULT CURRENT_TIMESTAMP;
