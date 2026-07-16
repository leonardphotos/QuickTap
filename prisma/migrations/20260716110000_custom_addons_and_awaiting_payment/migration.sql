-- Adicionales del Plan Personalizado (CUSTOM).
ALTER TABLE "restaurants" ADD COLUMN "customAdministration" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "restaurants" ADD COLUMN "customInventoryBasic" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "restaurants" ADD COLUMN "customInventoryRecipe" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "restaurants" ADD COLUMN "customAccountsPayable" BOOLEAN NOT NULL DEFAULT false;

-- "Pendiente por pagar" (cuenta abierta) en Pedidos / Administración.
ALTER TABLE "orders" ADD COLUMN "awaitingPayment" BOOLEAN NOT NULL DEFAULT false;
