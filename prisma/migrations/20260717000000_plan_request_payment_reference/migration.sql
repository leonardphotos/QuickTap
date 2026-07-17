-- El pago de plan ya no exige subir foto/PDF del comprobante: el restaurante
-- solo escribe el número de referencia de la transferencia/pago.
ALTER TABLE "plan_requests" RENAME COLUMN "proofUrl" TO "paymentReference";
