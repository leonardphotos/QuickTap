-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('CONFIRMED', 'CANCELLED');

-- AlterTable: mesa asignada a un mesero
ALTER TABLE "tables" ADD COLUMN "assignedWaiterId" TEXT;

-- CreateTable: horario de apertura/cierre por día de la semana
CREATE TABLE "restaurant_schedules" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "openTime" TEXT,
    "closeTime" TEXT,

    CONSTRAINT "restaurant_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable: reservas de mesa hechas desde el menú público
CREATE TABLE "reservations" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "time" TEXT NOT NULL,
    "partySize" INTEGER NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerIdNumber" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'CONFIRMED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable: join implícito Reservation <-> Table
CREATE TABLE "_ReservationToTable" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_schedules_restaurantId_dayOfWeek_key" ON "restaurant_schedules"("restaurantId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "reservations_restaurantId_date_idx" ON "reservations"("restaurantId", "date");

-- CreateIndex
CREATE INDEX "tables_assignedWaiterId_idx" ON "tables"("assignedWaiterId");

-- CreateIndex
CREATE UNIQUE INDEX "_ReservationToTable_AB_unique" ON "_ReservationToTable"("A", "B");

-- CreateIndex
CREATE INDEX "_ReservationToTable_B_index" ON "_ReservationToTable"("B");

-- AddForeignKey
ALTER TABLE "tables" ADD CONSTRAINT "tables_assignedWaiterId_fkey" FOREIGN KEY ("assignedWaiterId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_schedules" ADD CONSTRAINT "restaurant_schedules_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ReservationToTable" ADD CONSTRAINT "_ReservationToTable_A_fkey" FOREIGN KEY ("A") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ReservationToTable" ADD CONSTRAINT "_ReservationToTable_B_fkey" FOREIGN KEY ("B") REFERENCES "tables"("id") ON DELETE CASCADE ON UPDATE CASCADE;
