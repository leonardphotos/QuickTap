-- Rol de puerta: escanea las entradas de un evento y puede venderlas en el sitio.
ALTER TYPE "UserRole" ADD VALUE 'VERIFICADOR';

-- Entradas emitidas de un evento. Se emiten con el pago ya verificado (venta del POS, o pedido
-- de la tienda que el local confirmó).
CREATE TABLE "shop_tickets" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "shopSaleId" TEXT,
    "shopOrderId" TEXT,
    -- Token opaco embebido en el QR: no codifica datos del ticket, solo lo identifica.
    "accessToken" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "eventDate" TEXT,
    "eventTime" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "holderName" TEXT,
    "holderPhone" TEXT,
    "seatNumber" INTEGER NOT NULL,
    "checkedInAt" TIMESTAMP(3),
    "checkedInByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_tickets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "shop_tickets_accessToken_key" ON "shop_tickets"("accessToken");
-- Un puesto no puede repetirse dentro del mismo evento: es lo que impide dos boletos iguales.
CREATE UNIQUE INDEX "shop_tickets_productId_seatNumber_key" ON "shop_tickets"("productId", "seatNumber");
CREATE INDEX "shop_tickets_restaurantId_productId_idx" ON "shop_tickets"("restaurantId", "productId");
CREATE INDEX "shop_tickets_shopSaleId_idx" ON "shop_tickets"("shopSaleId");

ALTER TABLE "shop_tickets" ADD CONSTRAINT "shop_tickets_restaurantId_fkey"
  FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shop_tickets" ADD CONSTRAINT "shop_tickets_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "shop_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
