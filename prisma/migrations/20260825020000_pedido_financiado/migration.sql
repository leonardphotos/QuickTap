-- El comprador eligió financiar: al confirmar, la venta se arma a crédito con el plan de
-- cuotas del evento en vez de cobrarse completa.
ALTER TABLE "shop_orders" ADD COLUMN "financed" BOOLEAN NOT NULL DEFAULT false;
