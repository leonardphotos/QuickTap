-- CreateEnum
CREATE TYPE "ClubLoyaltyReason" AS ENUM ('BOOKING', 'CONSUMPTION', 'MANUAL', 'REDEEM', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ClubInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED');

-- AlterTable
ALTER TABLE "club_bookings" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledBy" TEXT,
ADD COLUMN     "playerAccountId" TEXT,
ADD COLUMN     "verifiedPhoneAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "club_booking_settings" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "requirePhoneVerification" BOOLEAN NOT NULL DEFAULT true,
    "otpTtlMinutes" INTEGER NOT NULL DEFAULT 10,
    "autoBlacklistEnabled" BOOLEAN NOT NULL DEFAULT true,
    "noShowStrikesToBlock" INTEGER NOT NULL DEFAULT 1,
    "loyaltyEnabled" BOOLEAN NOT NULL DEFAULT true,
    "pointsPerBooking" INTEGER NOT NULL DEFAULT 10,
    "pointsPerCurrencyUnit" DECIMAL(8,2) NOT NULL DEFAULT 1,
    "pointsPerRedeemUnit" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "club_booking_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_phone_verifications" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "club_phone_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_player_accounts" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "lastLoginAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "club_player_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_blacklist_entries" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "customerId" TEXT,
    "reason" TEXT NOT NULL,
    "automatic" BOOLEAN NOT NULL DEFAULT false,
    "noShowCount" INTEGER NOT NULL DEFAULT 0,
    "liftedAt" TIMESTAMP(3),
    "liftedByUserId" TEXT,
    "liftedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "club_blacklist_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_loyalty_entries" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" "ClubLoyaltyReason" NOT NULL,
    "note" TEXT,
    "bookingId" TEXT,
    "amountBase" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "club_loyalty_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_play_invites" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "fromAccountId" TEXT NOT NULL,
    "toAccountId" TEXT,
    "toPhone" TEXT,
    "toName" TEXT,
    "bookingId" TEXT,
    "message" TEXT,
    "status" "ClubInviteStatus" NOT NULL DEFAULT 'PENDING',
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "club_play_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "club_booking_settings_restaurantId_key" ON "club_booking_settings"("restaurantId");

-- CreateIndex
CREATE INDEX "club_phone_verifications_restaurantId_phone_expiresAt_idx" ON "club_phone_verifications"("restaurantId", "phone", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "club_player_accounts_customerId_key" ON "club_player_accounts"("customerId");

-- CreateIndex
CREATE INDEX "club_player_accounts_restaurantId_active_idx" ON "club_player_accounts"("restaurantId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "club_player_accounts_restaurantId_username_key" ON "club_player_accounts"("restaurantId", "username");

-- CreateIndex
CREATE INDEX "club_blacklist_entries_restaurantId_phone_liftedAt_idx" ON "club_blacklist_entries"("restaurantId", "phone", "liftedAt");

-- CreateIndex
CREATE INDEX "club_loyalty_entries_restaurantId_customerId_idx" ON "club_loyalty_entries"("restaurantId", "customerId");

-- CreateIndex
CREATE INDEX "club_loyalty_entries_bookingId_idx" ON "club_loyalty_entries"("bookingId");

-- CreateIndex
CREATE INDEX "club_play_invites_restaurantId_status_idx" ON "club_play_invites"("restaurantId", "status");

-- CreateIndex
CREATE INDEX "club_play_invites_toAccountId_status_idx" ON "club_play_invites"("toAccountId", "status");

-- AddForeignKey
ALTER TABLE "club_bookings" ADD CONSTRAINT "club_bookings_playerAccountId_fkey" FOREIGN KEY ("playerAccountId") REFERENCES "club_player_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_booking_settings" ADD CONSTRAINT "club_booking_settings_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_phone_verifications" ADD CONSTRAINT "club_phone_verifications_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_player_accounts" ADD CONSTRAINT "club_player_accounts_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_player_accounts" ADD CONSTRAINT "club_player_accounts_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_blacklist_entries" ADD CONSTRAINT "club_blacklist_entries_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_blacklist_entries" ADD CONSTRAINT "club_blacklist_entries_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_loyalty_entries" ADD CONSTRAINT "club_loyalty_entries_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_loyalty_entries" ADD CONSTRAINT "club_loyalty_entries_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_loyalty_entries" ADD CONSTRAINT "club_loyalty_entries_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "club_bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_play_invites" ADD CONSTRAINT "club_play_invites_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_play_invites" ADD CONSTRAINT "club_play_invites_fromAccountId_fkey" FOREIGN KEY ("fromAccountId") REFERENCES "club_player_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_play_invites" ADD CONSTRAINT "club_play_invites_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "club_player_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_play_invites" ADD CONSTRAINT "club_play_invites_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "club_bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
