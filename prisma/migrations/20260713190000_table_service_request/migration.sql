-- CreateEnum
CREATE TYPE "ServiceRequestType" AS ENUM ('WAITER_CALL', 'BILL_REQUEST');

-- AlterTable
ALTER TABLE "tables" ADD COLUMN     "serviceRequest" "ServiceRequestType",
ADD COLUMN     "serviceRequestAt" TIMESTAMP(3);
