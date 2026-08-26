-- Registro inborrable de comandas eliminadas (solo lo consultan Dueño/Admin;
-- no existe endpoint de borrado para esta tabla).
CREATE TABLE "order_deletion_logs" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "orderNumber" INTEGER NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "tableName" TEXT,
    "customerName" TEXT,
    "totalBase" DECIMAL(12,2) NOT NULL,
    "items" JSONB NOT NULL,
    "deletedByName" TEXT NOT NULL,
    "deletedByRole" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_deletion_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "order_deletion_logs_restaurantId_deletedAt_idx" ON "order_deletion_logs"("restaurantId", "deletedAt");

ALTER TABLE "order_deletion_logs" ADD CONSTRAINT "order_deletion_logs_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
