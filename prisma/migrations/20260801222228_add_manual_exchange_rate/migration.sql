-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "exchangeRateManual" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "manualExchangeRateBs" DECIMAL(12,4);
