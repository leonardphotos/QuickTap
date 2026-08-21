

-- CreateTable
CREATE TABLE "shop_pass_payments" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "shopSaleId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "installmentId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "method" TEXT NOT NULL,
    "proofImageUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "rejectionReason" TEXT,
    "salePaymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_pass_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shop_pass_payments_restaurantId_status_idx" ON "shop_pass_payments"("restaurantId", "status");

-- CreateIndex
CREATE INDEX "shop_pass_payments_shopSaleId_idx" ON "shop_pass_payments"("shopSaleId");

-- AddForeignKey
ALTER TABLE "shop_pass_payments" ADD CONSTRAINT "shop_pass_payments_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_pass_payments" ADD CONSTRAINT "shop_pass_payments_shopSaleId_fkey" FOREIGN KEY ("shopSaleId") REFERENCES "shop_sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

