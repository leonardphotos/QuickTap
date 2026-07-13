-- CreateEnum
CREATE TYPE "RestaurantSubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE');

-- CreateEnum
CREATE TYPE "PlanRequestKind" AS ENUM ('SIGNUP', 'RENEWAL');

-- CreateEnum
CREATE TYPE "PlanRequestStatus" AS ENUM ('PENDING', 'APPROVED');

-- AlterTable: suscripción del restaurante
ALTER TABLE "restaurants"
  ADD COLUMN "subscriptionStatus" "RestaurantSubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
  ADD COLUMN "subscriptionPlan" "SubscriptionPlan",
  ADD COLUMN "billingCycle" "BillingCycle",
  ADD COLUMN "periodEnd" TIMESTAMP(3);

-- Backfill: restaurantes ya existentes arrancan un trial de 15 días desde su creación.
UPDATE "restaurants" SET "periodEnd" = "createdAt" + INTERVAL '15 days' WHERE "periodEnd" IS NULL;

ALTER TABLE "restaurants" ALTER COLUMN "periodEnd" SET NOT NULL;

-- AlterTable: plan_requests (kind/status/restaurantId/promo)
ALTER TABLE "plan_requests"
  ADD COLUMN "kind" "PlanRequestKind" NOT NULL DEFAULT 'SIGNUP',
  ADD COLUMN "status" "PlanRequestStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "restaurantId" TEXT,
  ADD COLUMN "promoCode" TEXT,
  ADD COLUMN "discountPercent" INTEGER;

-- CreateIndex
CREATE INDEX "plan_requests_restaurantId_idx" ON "plan_requests"("restaurantId");

-- CreateIndex
CREATE INDEX "plan_requests_kind_status_idx" ON "plan_requests"("kind", "status");

-- AddForeignKey
ALTER TABLE "plan_requests" ADD CONSTRAINT "plan_requests_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "promo_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "discountPercent" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promo_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "promo_codes_code_key" ON "promo_codes"("code");

-- CreateTable
CREATE TABLE "platform_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "paymentMethods" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_admins" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_admins_email_key" ON "platform_admins"("email");
