-- AlterTable
ALTER TABLE "shop_products" ADD COLUMN     "pricingMode" TEXT NOT NULL DEFAULT 'UNIT',
ADD COLUMN     "rollLengthM" DOUBLE PRECISION,
ADD COLUMN     "rollWidths" JSONB;

-- AlterTable
ALTER TABLE "shop_sale_items" ADD COLUMN     "detail" TEXT;
