-- CreateTable
CREATE TABLE "shop_products" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subcategory" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL,
    "minStock" DOUBLE PRECISION NOT NULL,
    "wholesalePrice" DOUBLE PRECISION,
    "wholesaleMinQty" DOUBLE PRECISION,
    "promoPrice" DOUBLE PRECISION,
    "expiryDate" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_product_variants" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "v1" TEXT NOT NULL,
    "v2" TEXT NOT NULL,
    "stock" DOUBLE PRECISION NOT NULL,
    "soldByWeight" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "shop_product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_sales" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "returned" BOOLEAN NOT NULL DEFAULT false,
    "paymentMethod" TEXT,
    "paymentMeta" JSONB,
    "creditTerms" TEXT,
    "amountPaidNow" DOUBLE PRECISION,

    CONSTRAINT "shop_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_sale_items" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "productId" TEXT,
    "v1" TEXT NOT NULL,
    "v2" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "qty" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL,
    "soldByWeight" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "shop_sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_purchases" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "supplier" TEXT NOT NULL,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "v1" TEXT NOT NULL,
    "v2" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL,
    "time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_stock_adjustments" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "v1" TEXT NOT NULL,
    "v2" TEXT NOT NULL,
    "before" DOUBLE PRECISION NOT NULL,
    "after" DOUBLE PRECISION NOT NULL,
    "diff" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_stock_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_cash_sessions" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "opening" DOUBLE PRECISION NOT NULL,
    "salesCount" INTEGER,
    "totalSales" DOUBLE PRECISION,
    "expected" DOUBLE PRECISION,
    "counted" DOUBLE PRECISION,
    "diff" DOUBLE PRECISION,

    CONSTRAINT "shop_cash_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_categories" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "shop_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_subcategories" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "shop_subcategories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shop_products_restaurantId_idx" ON "shop_products"("restaurantId");

-- CreateIndex
CREATE INDEX "shop_product_variants_productId_idx" ON "shop_product_variants"("productId");

-- CreateIndex
CREATE INDEX "shop_sales_restaurantId_idx" ON "shop_sales"("restaurantId");

-- CreateIndex
CREATE INDEX "shop_sale_items_saleId_idx" ON "shop_sale_items"("saleId");

-- CreateIndex
CREATE INDEX "shop_purchases_restaurantId_idx" ON "shop_purchases"("restaurantId");

-- CreateIndex
CREATE INDEX "shop_stock_adjustments_restaurantId_idx" ON "shop_stock_adjustments"("restaurantId");

-- CreateIndex
CREATE INDEX "shop_cash_sessions_restaurantId_idx" ON "shop_cash_sessions"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "shop_categories_restaurantId_name_key" ON "shop_categories"("restaurantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "shop_subcategories_restaurantId_category_name_key" ON "shop_subcategories"("restaurantId", "category", "name");

-- AddForeignKey
ALTER TABLE "shop_products" ADD CONSTRAINT "shop_products_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_product_variants" ADD CONSTRAINT "shop_product_variants_productId_fkey" FOREIGN KEY ("productId") REFERENCES "shop_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_sales" ADD CONSTRAINT "shop_sales_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_sale_items" ADD CONSTRAINT "shop_sale_items_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "shop_sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_purchases" ADD CONSTRAINT "shop_purchases_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_stock_adjustments" ADD CONSTRAINT "shop_stock_adjustments_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_cash_sessions" ADD CONSTRAINT "shop_cash_sessions_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_categories" ADD CONSTRAINT "shop_categories_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_subcategories" ADD CONSTRAINT "shop_subcategories_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
