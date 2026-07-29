-- CreateTable
CREATE TABLE "plan_request_payments" (
    "id" TEXT NOT NULL,
    "planRequestId" TEXT NOT NULL,
    "amountUsd" DECIMAL(10,2) NOT NULL,
    "paymentMethod" "SubscriptionPaymentMethod" NOT NULL,
    "paymentReference" TEXT NOT NULL,
    "proofImageUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_request_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plan_request_payments_planRequestId_idx" ON "plan_request_payments"("planRequestId");

-- AddForeignKey
ALTER TABLE "plan_request_payments" ADD CONSTRAINT "plan_request_payments_planRequestId_fkey" FOREIGN KEY ("planRequestId") REFERENCES "plan_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
