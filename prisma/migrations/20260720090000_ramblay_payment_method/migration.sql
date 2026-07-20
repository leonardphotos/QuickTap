-- Nuevo método de pago RAMBLAY (C2P / Binance Pay): la aprobación llega por
-- webhook en vez de revisión manual de comprobante.
ALTER TYPE "SubscriptionPaymentMethod" ADD VALUE IF NOT EXISTS 'RAMBLAY';

-- Id de la transacción/sesión de pago en Ramblay, para correlacionar el webhook.
ALTER TABLE "plan_requests" ADD COLUMN "ramblayPaymentId" TEXT;
CREATE UNIQUE INDEX "plan_requests_ramblayPaymentId_key" ON "plan_requests"("ramblayPaymentId");
