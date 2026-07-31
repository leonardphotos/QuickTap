-- AlterTable
ALTER TABLE "products" ADD COLUMN     "promoDaysOfWeek" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "promoEndDate" TIMESTAMP(3),
ADD COLUMN     "promoEndTime" TEXT,
ADD COLUMN     "promoPrice" DECIMAL(12,2),
ADD COLUMN     "promoPriceEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "promoStartDate" TIMESTAMP(3),
ADD COLUMN     "promoStartTime" TEXT;
