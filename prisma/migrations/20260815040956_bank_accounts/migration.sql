-- CreateEnum
CREATE TYPE "BankAccountCurrency" AS ENUM ('BASE', 'BS');

-- CreateEnum
CREATE TYPE "BankTransactionType" AS ENUM ('CREDIT', 'DEBIT', 'TRANSFER_IN', 'TRANSFER_OUT');

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" "BankAccountCurrency" NOT NULL,
    "isPettyCash" BOOLEAN NOT NULL DEFAULT false,
    "paymentMethods" "PaymentMethod"[],
    "balance" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_transactions" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "type" "BankTransactionType" NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "amountBase" DECIMAL(12,2) NOT NULL,
    "description" TEXT NOT NULL,
    "paymentMethod" "PaymentMethod",
    "movementId" TEXT,
    "sourceRef" TEXT,
    "counterpartAccountId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bank_accounts_restaurantId_idx" ON "bank_accounts"("restaurantId");

-- CreateIndex
CREATE INDEX "bank_transactions_restaurantId_accountId_createdAt_idx" ON "bank_transactions"("restaurantId", "accountId", "createdAt");

-- CreateIndex
CREATE INDEX "bank_transactions_movementId_idx" ON "bank_transactions"("movementId");

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "bank_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

