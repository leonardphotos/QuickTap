-- De dónde salió la reserva: del menú público o cargada por el restaurante.
CREATE TYPE "ReservationSource" AS ENUM ('PUBLIC', 'STAFF');
ALTER TABLE "reservations" ADD COLUMN "source" "ReservationSource" NOT NULL DEFAULT 'PUBLIC';

-- Nota del salón y rastro de cuándo se sentaron y en qué cuenta.
ALTER TABLE "reservations" ADD COLUMN "note" TEXT;
ALTER TABLE "reservations" ADD COLUMN "seatedAt" TIMESTAMP(3);
ALTER TABLE "reservations" ADD COLUMN "tableSessionId" TEXT;

CREATE INDEX "reservations_tableSessionId_idx" ON "reservations"("tableSessionId");

ALTER TABLE "reservations" ADD CONSTRAINT "reservations_tableSessionId_fkey"
  FOREIGN KEY ("tableSessionId") REFERENCES "table_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
