-- Quién cobró la venta en el POS de Shop (cajero/vendedor), para mostrarlo en el historial
-- cuando hay varios usuarios con acceso a la caja. Sin relación FK, igual que
-- shop_sale_items.staffUserId — la venta histórica no debe romperse si el usuario se borra.
ALTER TABLE "shop_sales" ADD COLUMN "soldByUserId" TEXT;
ALTER TABLE "shop_sales" ADD COLUMN "soldByUserName" TEXT;
