-- Frecuencia entre cuotas y recargo por financiamiento.
ALTER TABLE "shop_installment_plans" ADD COLUMN "frequency" TEXT NOT NULL DEFAULT 'MENSUAL';
ALTER TABLE "shop_installment_plans" ADD COLUMN "surchargePercent" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "shop_installment_plans" ADD COLUMN "surchargeAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
