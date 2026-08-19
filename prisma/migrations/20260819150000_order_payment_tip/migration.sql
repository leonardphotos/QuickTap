-- Propina cobrada en un pago puntual (ver OrderPayment.tipBase en schema.prisma).
ALTER TABLE "order_payments" ADD COLUMN "tipBase" DECIMAL(12,2);
