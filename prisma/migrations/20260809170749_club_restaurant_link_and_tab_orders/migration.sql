-- CreateEnum
CREATE TYPE "ClubTabOrderStatus" AS ENUM ('PENDING', 'PREPARING', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ClubTabItemSource" AS ENUM ('CLUB_STORE', 'RESTAURANT');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'CANCHA';

-- CreateTable
CREATE TABLE "club_link_codes" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "usedByClubId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "club_link_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_restaurant_links" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "club_restaurant_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_tab_orders" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "courtName" TEXT NOT NULL,
    "status" "ClubTabOrderStatus" NOT NULL DEFAULT 'PENDING',
    "totalBase" DECIMAL(12,2) NOT NULL,
    "exchangeRate" DECIMAL(12,4) NOT NULL,
    "totalBs" DECIMAL(14,2) NOT NULL,
    "kitchenRestaurantId" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "club_tab_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_tab_items" (
    "id" TEXT NOT NULL,
    "tabOrderId" TEXT NOT NULL,
    "source" "ClubTabItemSource" NOT NULL,
    "sourceProductId" TEXT,
    "variantV1" TEXT,
    "productName" TEXT NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "lineTotal" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "club_tab_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "club_link_codes_code_key" ON "club_link_codes"("code");

-- CreateIndex
CREATE INDEX "club_link_codes_restaurantId_expiresAt_idx" ON "club_link_codes"("restaurantId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "club_restaurant_links_clubId_key" ON "club_restaurant_links"("clubId");

-- CreateIndex
CREATE INDEX "club_restaurant_links_restaurantId_idx" ON "club_restaurant_links"("restaurantId");

-- CreateIndex
CREATE INDEX "club_tab_orders_restaurantId_status_idx" ON "club_tab_orders"("restaurantId", "status");

-- CreateIndex
CREATE INDEX "club_tab_orders_bookingId_idx" ON "club_tab_orders"("bookingId");

-- CreateIndex
CREATE INDEX "club_tab_orders_kitchenRestaurantId_status_idx" ON "club_tab_orders"("kitchenRestaurantId", "status");

-- CreateIndex
CREATE INDEX "club_tab_items_tabOrderId_idx" ON "club_tab_items"("tabOrderId");

-- AddForeignKey
ALTER TABLE "club_link_codes" ADD CONSTRAINT "club_link_codes_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_restaurant_links" ADD CONSTRAINT "club_restaurant_links_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_restaurant_links" ADD CONSTRAINT "club_restaurant_links_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_tab_orders" ADD CONSTRAINT "club_tab_orders_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_tab_orders" ADD CONSTRAINT "club_tab_orders_kitchenRestaurantId_fkey" FOREIGN KEY ("kitchenRestaurantId") REFERENCES "restaurants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_tab_orders" ADD CONSTRAINT "club_tab_orders_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "club_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_tab_items" ADD CONSTRAINT "club_tab_items_tabOrderId_fkey" FOREIGN KEY ("tabOrderId") REFERENCES "club_tab_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
