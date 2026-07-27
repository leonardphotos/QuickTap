-- CreateEnum
CREATE TYPE "BusinessType" AS ENUM ('RESTAURANT', 'SHOP');

-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "businessType" "BusinessType" NOT NULL DEFAULT 'RESTAURANT',
ADD COLUMN     "shopRubro" TEXT;
