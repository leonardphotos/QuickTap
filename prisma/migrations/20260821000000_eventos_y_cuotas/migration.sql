-- Eventos y pago por cuotas para locales comerciales.
--
-- Los DROP INDEX que generaba el diff automático se quitaron a mano: corresponden a índices que
-- existen en producción pero que el esquema ya no declara (deriva previa, ajena a esta
-- funcionalidad). Borrarlos acá sería un efecto colateral que nadie pidió.

-- AlterTable
ALTER TABLE "shop_products" ADD COLUMN     "eventDate" TEXT,
ADD COLUMN     "eventSeats" INTEGER,
ADD COLUMN     "isEvent" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "shop_sale_payments" ADD COLUMN     "installmentId" TEXT;

-- CreateTable
CREATE TABLE "shop_installment_plans" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "shopSaleId" TEXT NOT NULL,
    "lateFeeAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "alertDaysBefore" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_installment_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_installments" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "dueDate" TEXT NOT NULL,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidAt" TIMESTAMP(3),
    "lateFeeCharged" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_installments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shop_installment_plans_shopSaleId_key" ON "shop_installment_plans"("shopSaleId");

-- CreateIndex
CREATE INDEX "shop_installment_plans_restaurantId_idx" ON "shop_installment_plans"("restaurantId");

-- CreateIndex
CREATE INDEX "shop_installments_planId_idx" ON "shop_installments"("planId");

-- CreateIndex
CREATE INDEX "shop_installments_dueDate_idx" ON "shop_installments"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "shop_installments_planId_number_key" ON "shop_installments"("planId", "number");

-- CreateIndex
CREATE INDEX "shop_sale_payments_installmentId_idx" ON "shop_sale_payments"("installmentId");

-- AddForeignKey
ALTER TABLE "shop_sale_payments" ADD CONSTRAINT "shop_sale_payments_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "shop_installments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_installment_plans" ADD CONSTRAINT "shop_installment_plans_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_installment_plans" ADD CONSTRAINT "shop_installment_plans_shopSaleId_fkey" FOREIGN KEY ("shopSaleId") REFERENCES "shop_sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_installments" ADD CONSTRAINT "shop_installments_planId_fkey" FOREIGN KEY ("planId") REFERENCES "shop_installment_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

