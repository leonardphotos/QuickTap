-- AlterTable
ALTER TABLE "shop_products" ADD COLUMN     "brand" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "shop_sales" ADD COLUMN     "dueDate" TEXT,
ADD COLUMN     "settledAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "note" TEXT,
    "items" JSONB NOT NULL,
    "totalBase" DECIMAL(12,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "convertedToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_sale_payments" (
    "id" TEXT NOT NULL,
    "shopSaleId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "method" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_sale_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quotes_restaurantId_createdAt_idx" ON "quotes"("restaurantId", "createdAt");

-- CreateIndex
CREATE INDEX "shop_sale_payments_shopSaleId_idx" ON "shop_sale_payments"("shopSaleId");

-- CreateIndex
CREATE INDEX "shop_sales_restaurantId_creditTerms_settledAt_idx" ON "shop_sales"("restaurantId", "creditTerms", "settledAt");

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_sale_payments" ADD CONSTRAINT "shop_sale_payments_shopSaleId_fkey" FOREIGN KEY ("shopSaleId") REFERENCES "shop_sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
