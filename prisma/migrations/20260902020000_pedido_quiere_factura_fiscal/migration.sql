-- Intención de documento del cliente: nota de entrega (por defecto) o factura fiscal.
-- Se marca al tomar el pedido y se puede cambiar al cobrar. No es el hecho de haberla
-- emitido — eso sigue siendo orders."fiscalPrintedAt".
ALTER TABLE "orders" ADD COLUMN "wantsFiscalInvoice" BOOLEAN NOT NULL DEFAULT false;

-- Los pedidos que YA tienen factura fiscal impresa evidentemente la querían: sin esto,
-- al reabrir uno viejo el cobro le ofrecería nota de entrega.
UPDATE "orders" SET "wantsFiscalInvoice" = true WHERE "fiscalPrintedAt" IS NOT NULL;
