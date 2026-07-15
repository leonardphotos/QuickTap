-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'BINANCE';
ALTER TYPE "PaymentMethod" ADD VALUE 'PAYPAL';
ALTER TYPE "PaymentMethod" ADD VALUE 'TRANSFER';

-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "paymentMethodsConfig" JSONB;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "deliveryCourierId" TEXT,
ADD COLUMN     "deliveryDispatchedAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_deliveryCourierId_fkey" FOREIGN KEY ("deliveryCourierId") REFERENCES "delivery_couriers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
