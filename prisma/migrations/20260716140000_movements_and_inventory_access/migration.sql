-- Acceso a Inventario otorgado individualmente a un miembro del equipo con rol restringido.
ALTER TABLE "users" ADD COLUMN "canAccessInventory" BOOLEAN NOT NULL DEFAULT false;

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('INCOME', 'EXPENSE');

-- Movimiento manual de caja: ingresos/egresos y propinas sueltas, botón
-- "Añadir movimiento" en Administración → Resumen.
CREATE TABLE "movements" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "type" "MovementType" NOT NULL,
    "amountBase" DECIMAL(12,2) NOT NULL,
    "description" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "movements_restaurantId_createdAt_idx" ON "movements"("restaurantId", "createdAt");

-- AddForeignKey
ALTER TABLE "movements" ADD CONSTRAINT "movements_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movements" ADD CONSTRAINT "movements_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
