-- Sucursales: otra fila de Restaurant enlazada a su sede principal.
ALTER TABLE "restaurants" ADD COLUMN "parentRestaurantId" TEXT;
ALTER TABLE "restaurants" ADD COLUMN "pendingWelcomePlan" "SubscriptionPlan";

CREATE INDEX "restaurants_parentRestaurantId_idx" ON "restaurants"("parentRestaurantId");

ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_parentRestaurantId_fkey"
  FOREIGN KEY ("parentRestaurantId") REFERENCES "restaurants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 2 planes nuevos: "Sucursales" ($69.99/mes, todos los beneficios de Pro) y
-- "Delivery Sucursales" ($29.99/mes, beneficios de Delivery), ambos con
-- tope de 5 sucursales.
ALTER TYPE "SubscriptionPlan" ADD VALUE IF NOT EXISTS 'SUCURSALES';
ALTER TYPE "SubscriptionPlan" ADD VALUE IF NOT EXISTS 'DELIVERY_SUCURSALES';
