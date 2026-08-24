-- Pedido abierto del Local: carrito parado para seguir cargándole productos más tarde.
-- No es una venta: no descuenta stock ni entra en caja (ver ShopOpenOrder en schema.prisma).
CREATE TABLE "shop_open_orders" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "items" JSONB NOT NULL,
    "createdByUserId" TEXT,
    "createdByUserName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_open_orders_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "shop_open_orders_restaurantId_updatedAt_idx" ON "shop_open_orders"("restaurantId", "updatedAt");

ALTER TABLE "shop_open_orders" ADD CONSTRAINT "shop_open_orders_restaurantId_fkey"
  FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
