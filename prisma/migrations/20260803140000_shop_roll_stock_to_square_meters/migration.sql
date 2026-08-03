-- El stock de los rollos de impresión pasa de metros LINEALES a METROS CUADRADOS.
--
-- Antes se guardaba el largo restante del rollo (50 m) y se descontaba el largo impreso. Ahora se
-- guarda la superficie (1,22 × 50 = 61 m²) y se descuenta el ancho completo por el largo impreso,
-- que es exactamente lo que se le factura al cliente.
--
-- La conversión es stock × ancho del rollo. El ancho está en ShopProductVariant.v1, guardado como
-- etiqueta con coma decimal ("1,22"), así que se normaliza a punto antes de convertir. Solo se
-- tocan productos AREA_ROLL cuyo v1 sea un número — cualquier otra variante queda intacta.
UPDATE "shop_product_variants" v
SET "stock" = v."stock" * CAST(REPLACE(v."v1", ',', '.') AS DOUBLE PRECISION)
FROM "shop_products" p
WHERE v."productId" = p."id"
  AND p."pricingMode" = 'AREA_ROLL'
  AND v."v1" ~ '^[0-9]+([.,][0-9]+)?$';
