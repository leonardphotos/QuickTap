-- Push del Wallet (teléfonos de clientes finales) y sello del recordatorio de cuota.
CREATE TABLE "wallet_device_tokens" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "wallet_device_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "wallet_device_tokens_token_key" ON "wallet_device_tokens"("token");
CREATE INDEX "wallet_device_tokens_phone_idx" ON "wallet_device_tokens"("phone");
ALTER TABLE "shop_installments" ADD COLUMN "reminderSentAt" TIMESTAMP(3);
