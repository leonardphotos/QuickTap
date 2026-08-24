-- Plan de consumo del vertical Local Comercial: metros comprados por adelantado a tarifa
-- rebajada, consumidos con el tiempo. Ver ShopConsumptionPlan en schema.prisma.
ALTER TABLE "shop_products" ADD COLUMN "consumptionPlanEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "shop_products" ADD COLUMN "consumptionPlanRate" DOUBLE PRECISION;
ALTER TABLE "shop_products" ADD COLUMN "consumptionPlanSizes" JSONB;

CREATE TABLE "shop_consumption_plans" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "totalUnits" DOUBLE PRECISION NOT NULL,
    "remainingUnits" DOUBLE PRECISION NOT NULL,
    "ratePerUnit" DOUBLE PRECISION NOT NULL,
    "totalPaid" DOUBLE PRECISION NOT NULL,
    "activatedSaleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "shop_consumption_plans_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "shop_consumption_plans_restaurantId_customerPhone_idx" ON "shop_consumption_plans"("restaurantId", "customerPhone");
CREATE INDEX "shop_consumption_plans_restaurantId_productId_closedAt_idx" ON "shop_consumption_plans"("restaurantId", "productId", "closedAt");

ALTER TABLE "shop_consumption_plans" ADD CONSTRAINT "shop_consumption_plans_restaurantId_fkey"
  FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shop_consumption_plans" ADD CONSTRAINT "shop_consumption_plans_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "shop_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
