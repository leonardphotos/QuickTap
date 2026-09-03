-- La bitácora de comandas borradas guardaba el total del pedido, pero no cuánto se había
-- COBRADO ya. Sin ese dato no se puede distinguir un pedido cargado por error (que nadie
-- pagó) de uno borrado después de haber recibido el efectivo — que es exactamente el caso
-- que este registro existe para poder revisar.
ALTER TABLE "order_deletion_logs" ADD COLUMN "paidBase" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "order_deletion_logs" ADD COLUMN "paidMethods" JSONB;
