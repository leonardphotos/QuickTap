-- AlterEnum
ALTER TYPE "SubscriptionPlan" ADD VALUE 'ELITE_SHOP';

-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "legacyFullAccessUntil" TIMESTAMP(3);


-- Backfill: los locales que ya tenían el plan Shop ACTIVO (pagado, no en prueba) conservan
-- todos los beneficios hasta el vencimiento de su período actual. Los que están en prueba
-- arrancan directo con las reglas nuevas.
UPDATE "restaurants"
SET "legacyFullAccessUntil" = "periodEnd"
WHERE "subscriptionPlan" = 'SHOP'
  AND "subscriptionStatus" = 'ACTIVE'
  AND "periodEnd" > NOW();
