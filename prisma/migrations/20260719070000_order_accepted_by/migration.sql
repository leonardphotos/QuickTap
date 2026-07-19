ALTER TABLE "orders" ADD COLUMN "acceptedByUserId" TEXT;

ALTER TABLE "orders" ADD CONSTRAINT "orders_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
