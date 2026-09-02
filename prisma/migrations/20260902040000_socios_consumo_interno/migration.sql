-- Socios: consumen a cuenta y ese consumo no es una venta (no suma a administración),
-- pero sí descuenta inventario. Ver Customer.isPartner y Order.isPartnerConsumption.
ALTER TABLE "customers" ADD COLUMN "isPartner" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "orders" ADD COLUMN "isPartnerConsumption" BOOLEAN NOT NULL DEFAULT false;

-- Los reportes filtran por esta columna en cada agregación de ventas: sin el índice,
-- cada consulta del panel se come un seq scan de la tabla de pedidos.
CREATE INDEX "orders_restaurantId_isPartnerConsumption_createdAt_idx"
  ON "orders" ("restaurantId", "isPartnerConsumption", "createdAt");
