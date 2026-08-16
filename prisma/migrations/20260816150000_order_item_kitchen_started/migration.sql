-- AlterTable
-- Marca "En proceso" por estación de cocina (informativa, no cambia el estado del pedido).
ALTER TABLE "order_items" ADD COLUMN     "kitchenStartedAt" TIMESTAMP(3);
