-- Vuelto (cambio) al cobrar: cuánto entregó el cliente, cuánto se le devolvió y por qué método.

-- AlterTable
ALTER TABLE "order_payments"
  ADD COLUMN "amountReceivedBase" DECIMAL(12,2),
  ADD COLUMN "changeBase" DECIMAL(12,2),
  ADD COLUMN "changeMethod" "PaymentMethod",
  ADD COLUMN "changeReferenceNumber" TEXT;
