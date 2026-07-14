-- CreateEnum
CREATE TYPE "QrNfcRequestStatus" AS ENUM ('PENDING', 'APPROVED');

-- CreateTable
CREATE TABLE "qr_nfc_requests" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceUsd" DECIMAL(10,2) NOT NULL,
    "totalPriceUsd" DECIMAL(10,2) NOT NULL,
    "status" "QrNfcRequestStatus" NOT NULL DEFAULT 'PENDING',
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qr_nfc_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "qr_nfc_requests_restaurantId_idx" ON "qr_nfc_requests"("restaurantId");

-- CreateIndex
CREATE INDEX "qr_nfc_requests_status_idx" ON "qr_nfc_requests"("status");

-- AddForeignKey
ALTER TABLE "qr_nfc_requests" ADD CONSTRAINT "qr_nfc_requests_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

