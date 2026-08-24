-- Eventos (categoría "Tickets" de locales comerciales).

-- Hora de inicio "HH:mm". Texto y no timestamp, igual que eventDate: es la hora local del
-- local, sin huso horario que la corra.
ALTER TABLE "shop_products" ADD COLUMN "eventTime" TEXT;

-- Gasto imputado a un evento: el costo del evento es la SUMA de estos, no un campo escrito a
-- mano, así que se actualiza solo a medida que aparecen gastos.
ALTER TABLE "movements" ADD COLUMN "shopEventProductId" TEXT;

CREATE INDEX "movements_shopEventProductId_idx" ON "movements"("shopEventProductId");

-- SetNull: borrar el evento no puede borrar el gasto, que igual salió de la caja.
ALTER TABLE "movements"
  ADD CONSTRAINT "movements_shopEventProductId_fkey"
  FOREIGN KEY ("shopEventProductId") REFERENCES "shop_products"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
