-- AlterTable
ALTER TABLE "modifier_categories" ADD COLUMN "maxSelections" INTEGER;

-- AlterTable
ALTER TABLE "product_modifier_categories" ADD COLUMN "maxSelectionsOverride" INTEGER;

-- AlterTable
ALTER TABLE "order_item_modifiers" ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN "rif" TEXT;
