-- CreateEnum
CREATE TYPE "ClubReportedPaymentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');

-- CreateTable
CREATE TABLE "club_reported_payments" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "payeeRestaurantId" TEXT,
    "amountBase" DECIMAL(12,2) NOT NULL,
    "exchangeRate" DECIMAL(12,4) NOT NULL,
    "amountBs" DECIMAL(14,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "referenceNumber" TEXT,
    "status" "ClubReportedPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedAt" TIMESTAMP(3),
    "bookingPaymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "club_reported_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "club_reported_payments_restaurantId_status_idx" ON "club_reported_payments"("restaurantId", "status");

-- CreateIndex
CREATE INDEX "club_reported_payments_payeeRestaurantId_status_idx" ON "club_reported_payments"("payeeRestaurantId", "status");

-- CreateIndex
CREATE INDEX "club_reported_payments_bookingId_idx" ON "club_reported_payments"("bookingId");

-- AddForeignKey
ALTER TABLE "club_reported_payments" ADD CONSTRAINT "club_reported_payments_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_reported_payments" ADD CONSTRAINT "club_reported_payments_payeeRestaurantId_fkey" FOREIGN KEY ("payeeRestaurantId") REFERENCES "restaurants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_reported_payments" ADD CONSTRAINT "club_reported_payments_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "club_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

