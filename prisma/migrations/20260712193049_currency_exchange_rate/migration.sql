/*
  Warnings:

  - You are about to drop the column `subtotalUsd` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `totalUsd` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `exchangeRate` on the `restaurants` table. All the data in the column will be lost.
  - The `baseCurrency` column on the `restaurants` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Added the required column `currency` to the `orders` table without a default value. This is not possible if the table is not empty.
  - Added the required column `subtotalBase` to the `orders` table without a default value. This is not possible if the table is not empty.
  - Added the required column `totalBase` to the `orders` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('USD', 'EUR');

-- AlterTable
ALTER TABLE "orders" DROP COLUMN "subtotalUsd",
DROP COLUMN "totalUsd",
ADD COLUMN     "currency" "Currency" NOT NULL,
ADD COLUMN     "subtotalBase" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "totalBase" DECIMAL(12,2) NOT NULL;

-- AlterTable
ALTER TABLE "restaurants" DROP COLUMN "exchangeRate",
DROP COLUMN "baseCurrency",
ADD COLUMN     "baseCurrency" "Currency" NOT NULL DEFAULT 'USD';

-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" TEXT NOT NULL,
    "currency" "Currency" NOT NULL,
    "rateBs" DECIMAL(18,4) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'BCV',
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rates_currency_key" ON "exchange_rates"("currency");
