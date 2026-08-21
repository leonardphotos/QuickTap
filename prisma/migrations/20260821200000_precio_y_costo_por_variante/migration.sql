-- Precio y costo propios por variante (null = usa el del producto). Ver ShopProductVariant.
ALTER TABLE "shop_product_variants" ADD COLUMN "price" DOUBLE PRECISION;
ALTER TABLE "shop_product_variants" ADD COLUMN "cost" DOUBLE PRECISION;
