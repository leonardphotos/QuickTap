-- Ciclo de facturación anual (12 meses). ALTER TYPE ... ADD VALUE debe ir
-- en su propia migración: Postgres no permite usar el valor nuevo en la
-- misma transacción en que se agrega.
ALTER TYPE "BillingCycle" ADD VALUE IF NOT EXISTS 'ANNUAL';
