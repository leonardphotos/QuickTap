ALTER TABLE "orders" ADD COLUMN "employeeConsumerId" TEXT;
CREATE INDEX "orders_restaurantId_employeeConsumerId_idx" ON "orders"("restaurantId", "employeeConsumerId");
