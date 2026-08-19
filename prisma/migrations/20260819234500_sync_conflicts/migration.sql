-- Pedidos tomados sin internet que no se pudieron subir tal cual porque algo cambió en la nube
-- mientras tanto. Se guardan enteros para que una persona decida, en vez de perderlos o de
-- abortar toda la sincronización por uno solo.
CREATE TYPE "SyncConflictKind" AS ENUM ('SESSION_CLOSED', 'TABLE_MISSING', 'PRODUCT_MISSING', 'OTHER');

CREATE TABLE "sync_conflicts" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "kind" "SyncConflictKind" NOT NULL,
    "offlineTicketRef" TEXT,
    "reason" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_conflicts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sync_conflicts_restaurantId_resolvedAt_idx" ON "sync_conflicts"("restaurantId", "resolvedAt");

ALTER TABLE "sync_conflicts" ADD CONSTRAINT "sync_conflicts_restaurantId_fkey"
  FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
