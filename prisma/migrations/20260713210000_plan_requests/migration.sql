-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('TRIAL', 'STARTER', 'PRO', 'PREMIUM', 'CUSTOM');

-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'QUARTERLY', 'SEMIANNUAL');

-- CreateEnum
CREATE TYPE "SubscriptionPaymentMethod" AS ENUM ('PAGO_MOVIL', 'BINANCE', 'BANK_TRANSFER');

-- CreateTable
CREATE TABLE "plan_requests" (
    "id" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL,
    "billingCycle" "BillingCycle" NOT NULL,
    "customTables" INTEGER,
    "customUsers" INTEGER,
    "customOrders" INTEGER,
    "priceUsd" DECIMAL(10,2) NOT NULL,
    "paymentMethod" "SubscriptionPaymentMethod" NOT NULL,
    "proofUrl" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT,
    "restaurantName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_requests_pkey" PRIMARY KEY ("id")
);
