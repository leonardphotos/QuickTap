-- Adicionales elegidos en una solicitud de Plan Personalizado (se copian a
-- Restaurant al aprobar la solicitud).
ALTER TABLE "plan_requests" ADD COLUMN "customAdministration" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "plan_requests" ADD COLUMN "customInventoryBasic" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "plan_requests" ADD COLUMN "customInventoryRecipe" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "plan_requests" ADD COLUMN "customAccountsPayable" BOOLEAN NOT NULL DEFAULT false;
