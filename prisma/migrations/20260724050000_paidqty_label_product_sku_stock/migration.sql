ALTER TABLE "order_items" ADD COLUMN "paidQuantity" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "table_sessions" ADD COLUMN "label" TEXT;
ALTER TABLE "products" ADD COLUMN "sku" TEXT;
ALTER TABLE "products" ADD COLUMN "stockControlEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "products" ADD COLUMN "stockQuantity" INTEGER;
