-- "Entregado" por ítem de pedido — condición para pedir motivo al devolver (ver order.service.ts#returnItem).
ALTER TABLE "order_items" ADD COLUMN "deliveredAt" TIMESTAMP(3);
