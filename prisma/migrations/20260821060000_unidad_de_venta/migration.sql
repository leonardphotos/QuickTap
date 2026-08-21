-- Unidad de venta del producto: UND (unidad), KG (kilo) o MT (metro).
-- Los dos "-- DropIndex" que generaba el diff automático se quitaron a mano: son deriva previa
-- del esquema, ajena a este cambio (ver la migración de eventos y cuotas).
ALTER TABLE "shop_products" ADD COLUMN "saleUnit" TEXT NOT NULL DEFAULT 'UND';
