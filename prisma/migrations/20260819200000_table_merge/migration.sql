-- Unir mesas: la mesa miembro apunta a la principal, que es la única del grupo que lleva
-- cuenta (TableSession). Así el grupo paga una sola cuenta sin tocar el modelo de pedidos.
ALTER TABLE "tables" ADD COLUMN "mergedIntoTableId" TEXT;
ALTER TABLE "tables" ADD COLUMN "mergedAt" TIMESTAMP(3);

-- Posición en el plano antes de unirse, para devolver la mesa a su sitio al separarla.
ALTER TABLE "tables" ADD COLUMN "preMergePlanX" DECIMAL(5,2);
ALTER TABLE "tables" ADD COLUMN "preMergePlanY" DECIMAL(5,2);

CREATE INDEX "tables_restaurantId_mergedIntoTableId_idx" ON "tables"("restaurantId", "mergedIntoTableId");

ALTER TABLE "tables" ADD CONSTRAINT "tables_mergedIntoTableId_fkey"
  FOREIGN KEY ("mergedIntoTableId") REFERENCES "tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;
