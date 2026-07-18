-- Nuevo canal "Barra": pedido en el mostrador, sin mesa (igual que Pickup pero sin retiro externo).
ALTER TYPE "OrderChannel" ADD VALUE IF NOT EXISTS 'BAR';

-- Costo del producto para calcular el margen de utilidad en Administración.
ALTER TABLE "products" ADD COLUMN "costSource" TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "products" ADD COLUMN "costBase" DECIMAL(12,2);
