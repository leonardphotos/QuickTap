-- Lista de espera del salón: gente que ya está en la puerta esperando mesa.
CREATE TYPE "WaitlistStatus" AS ENUM ('WAITING', 'NOTIFIED', 'SEATED', 'CANCELLED', 'NO_SHOW');

CREATE TABLE "waitlist_entries" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT,
    "customerIdNumber" TEXT,
    "partySize" INTEGER NOT NULL,
    "zoneId" TEXT,
    "note" TEXT,
    "quotedMinutes" INTEGER,
    "status" "WaitlistStatus" NOT NULL DEFAULT 'WAITING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifiedAt" TIMESTAMP(3),
    "seatedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "tableSessionId" TEXT,

    CONSTRAINT "waitlist_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "waitlist_entries_restaurantId_status_createdAt_idx" ON "waitlist_entries"("restaurantId", "status", "createdAt");

ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_restaurantId_fkey"
  FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_zoneId_fkey"
  FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_tableSessionId_fkey"
  FOREIGN KEY ("tableSessionId") REFERENCES "table_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
