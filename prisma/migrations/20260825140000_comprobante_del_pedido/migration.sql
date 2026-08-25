-- Comprobante de pago que el comprador adjunta desde la tienda virtual.
ALTER TABLE "shop_orders" ADD COLUMN "paymentProofUrl" TEXT;
