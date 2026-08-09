-- CreateEnum
CREATE TYPE "ClubSport" AS ENUM ('PADEL', 'TENIS', 'FUTBOL', 'BASQUET', 'OTRO');

-- CreateEnum
CREATE TYPE "ClubBlockKind" AS ENUM ('BOOKING', 'MAINTENANCE', 'CLASS', 'TOURNAMENT');

-- CreateEnum
CREATE TYPE "ClubBlockStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ClubBookingStatus" AS ENUM ('PENDING_PAYMENT', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- AlterEnum
ALTER TYPE "BusinessType" ADD VALUE 'SPORTS_CLUB';

-- AlterEnum
ALTER TYPE "SubscriptionPlan" ADD VALUE 'CLUB';

-- CreateTable
CREATE TABLE "club_courts" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sport" "ClubSport" NOT NULL DEFAULT 'PADEL',
    "indoor" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "club_courts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_schedules" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "courtId" TEXT,
    "weekday" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "slotMinutes" INTEGER NOT NULL DEFAULT 90,
    "priceBase" DECIMAL(12,2) NOT NULL,
    "isPeak" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "club_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_court_blocks" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,
    "kind" "ClubBlockKind" NOT NULL,
    "status" "ClubBlockStatus" NOT NULL DEFAULT 'ACTIVE',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "club_court_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_bookings" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "customerId" TEXT,
    "playerName" TEXT NOT NULL,
    "playerPhone" TEXT NOT NULL,
    "totalBase" DECIMAL(12,2) NOT NULL,
    "exchangeRate" DECIMAL(12,4) NOT NULL,
    "totalBs" DECIMAL(14,2) NOT NULL,
    "playerCount" INTEGER NOT NULL DEFAULT 4,
    "status" "ClubBookingStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "accessToken" TEXT NOT NULL,
    "checkedInAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "club_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "club_courts_restaurantId_active_idx" ON "club_courts"("restaurantId", "active");

-- CreateIndex
CREATE INDEX "club_schedules_restaurantId_weekday_idx" ON "club_schedules"("restaurantId", "weekday");

-- CreateIndex
CREATE INDEX "club_schedules_courtId_idx" ON "club_schedules"("courtId");

-- CreateIndex
CREATE INDEX "club_court_blocks_restaurantId_startsAt_idx" ON "club_court_blocks"("restaurantId", "startsAt");

-- CreateIndex
CREATE INDEX "club_court_blocks_courtId_startsAt_idx" ON "club_court_blocks"("courtId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "club_bookings_blockId_key" ON "club_bookings"("blockId");

-- CreateIndex
CREATE UNIQUE INDEX "club_bookings_accessToken_key" ON "club_bookings"("accessToken");

-- CreateIndex
CREATE INDEX "club_bookings_restaurantId_status_idx" ON "club_bookings"("restaurantId", "status");

-- CreateIndex
CREATE INDEX "club_bookings_restaurantId_createdAt_idx" ON "club_bookings"("restaurantId", "createdAt");

-- CreateIndex
CREATE INDEX "club_bookings_customerId_idx" ON "club_bookings"("customerId");

-- AddForeignKey
ALTER TABLE "club_courts" ADD CONSTRAINT "club_courts_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_schedules" ADD CONSTRAINT "club_schedules_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_schedules" ADD CONSTRAINT "club_schedules_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "club_courts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_court_blocks" ADD CONSTRAINT "club_court_blocks_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_court_blocks" ADD CONSTRAINT "club_court_blocks_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "club_courts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_bookings" ADD CONSTRAINT "club_bookings_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_bookings" ADD CONSTRAINT "club_bookings_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "club_court_blocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_bookings" ADD CONSTRAINT "club_bookings_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
--  Anti doble-reserva a nivel de base de datos.
--
--  Una validación en el servicio ("buscar solapes, si no hay, insertar") NO
--  basta: dos jugadores que pulsan reservar en el mismo segundo pasan ambos la
--  comprobación y ambos insertan. Esta restricción lo hace imposible de forma
--  atómica, sin importar cuántos procesos escriban a la vez.
--
--  El rango es SEMIABIERTO '[)': 18:00-19:00 y 19:00-20:00 no se solapan.
--  Se excluyen los bloques CANCELLED para que una cancelación libere el hueco.
--  btree_gist es lo que permite mezclar un escalar (courtId) con un rango.
--
--  Se usa tsrange (no tstzrange) porque Prisma mapea DateTime a TIMESTAMP(3)
--  sin zona: convertir a timestamptz depende del TimeZone de la sesión y por eso
--  no es IMMUTABLE, requisito para indexar. Prisma ya guarda todo en UTC, así
--  que comparar los timestamps crudos es exactamente lo correcto.
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "club_court_blocks"
ADD CONSTRAINT "club_court_blocks_no_overlap"
EXCLUDE USING gist (
  "courtId" WITH =,
  tsrange("startsAt", "endsAt", '[)') WITH &&
) WHERE ("status" <> 'CANCELLED');
