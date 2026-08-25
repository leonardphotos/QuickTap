-- El comprador elige en cuántas cuotas financia (hasta el máximo del evento).
ALTER TABLE "shop_orders" ADD COLUMN "installmentsChosen" INTEGER;
