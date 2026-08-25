-- Cédula del comprador en los pedidos de la tienda virtual.
-- Nullable a propósito: los pedidos que ya existen no la tienen y no hay forma de inventarla.
ALTER TABLE "shop_orders" ADD COLUMN "customerIdNumber" TEXT;
