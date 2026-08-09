-- AlterTable
ALTER TABLE "club_bookings" ADD COLUMN     "awaitingPayment" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "club_booking_payments" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "amountBase" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "referenceNumber" TEXT,
    "proofImageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "club_booking_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "club_booking_payments_bookingId_idx" ON "club_booking_payments"("bookingId");

-- AddForeignKey
ALTER TABLE "club_booking_payments" ADD CONSTRAINT "club_booking_payments_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "club_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
