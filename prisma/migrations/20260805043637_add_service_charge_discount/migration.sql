-- AlterTable
ALTER TABLE "order_payments" ADD COLUMN     "serviceChargeDiscountBase" DECIMAL(12,2),
ADD COLUMN     "serviceChargeDiscountPercent" DECIMAL(5,2);
