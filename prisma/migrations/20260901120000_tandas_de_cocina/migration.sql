-- Tandas de cocina: cada ronda añadida a una comanda ya abierta sale como una tarjeta
-- aparte en la pantalla de Cocina, y cada tarjeta cuenta su propio tiempo de espera.
ALTER TABLE "order_items" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "order_items" ADD COLUMN "kitchenBatch" INTEGER NOT NULL DEFAULT 1;

-- Los ítems que ya existen no tienen fecha propia: se rellenan con la del pedido, que es la
-- que tenían de hecho. Sin esto todo lo viejo quedaría fechado el día de la migración y el
-- contador de cocina arrancaría en cero para comandas de hace semanas.
UPDATE "order_items" oi
SET "createdAt" = o."createdAt"
FROM "orders" o
WHERE oi."orderId" = o."id";
