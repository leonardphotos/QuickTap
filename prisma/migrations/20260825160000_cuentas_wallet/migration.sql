-- Cuentas de acceso a QuickTap Wallet: clave propia por teléfono, verificado por SMS.
CREATE TABLE "wallet_accounts" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "passwordHash" TEXT,
    "smsCodeHash" TEXT,
    "smsCodeExpiresAt" TIMESTAMP(3),
    "smsAttempts" INTEGER NOT NULL DEFAULT 0,
    "smsSentAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "wallet_accounts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "wallet_accounts_phone_key" ON "wallet_accounts"("phone");
