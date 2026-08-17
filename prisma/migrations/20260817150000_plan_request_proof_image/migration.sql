-- Comprobante opcional adjunto al pago único de un PlanRequest, para reenviarlo por WhatsApp
-- al número verificador.

-- AlterTable
ALTER TABLE "plan_requests" ADD COLUMN "proofImageUrl" TEXT;
