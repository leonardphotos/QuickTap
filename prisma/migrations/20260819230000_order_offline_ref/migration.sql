-- Referencia de la comanda impresa durante un corte de internet ("R-3"). El número definitivo
-- lo asigna la nube al sincronizar; este queda para rastrear el papel contra el sistema.
ALTER TABLE "orders" ADD COLUMN "offlineTicketRef" TEXT;

-- Buscar los pedidos que vinieron de un corte, para auditarlos.
CREATE INDEX "orders_restaurantId_offlineTicketRef_idx" ON "orders"("restaurantId", "offlineTicketRef");
