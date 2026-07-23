-- CreateEnum
CREATE TYPE "IncomeCategory" AS ENUM ('TIP', 'DEBT', 'OTHER');

-- AlterTable
ALTER TABLE "movements" ADD COLUMN "incomeCategory" "IncomeCategory";
ALTER TABLE "movements" ADD COLUMN "paymentMethod" "PaymentMethod";
