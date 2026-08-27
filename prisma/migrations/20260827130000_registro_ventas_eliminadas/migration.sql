-- Registro inborrable de ventas eliminadas (Locales Comerciales / Tickera). Solo
-- Dueño/Admin pueden consultarlo; no hay endpoint de borrado para esta tabla.
CREATE TABLE "shop_sale_deletion_logs" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "time" TIMESTAMP(3) NOT NULL,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "creditTerms" TEXT,
    "items" JSONB NOT NULL,
    "ticketsCount" INTEGER NOT NULL DEFAULT 0,
    "deletedByName" TEXT NOT NULL,
    "deletedByRole" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_sale_deletion_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "shop_sale_deletion_logs_restaurantId_deletedAt_idx" ON "shop_sale_deletion_logs"("restaurantId", "deletedAt");

ALTER TABLE "shop_sale_deletion_logs" ADD CONSTRAINT "shop_sale_deletion_logs_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
