-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" TEXT,
    "phone" TEXT,
    "idNumber" TEXT,
    "salaryBase" DECIMAL(12,2),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_payments" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "amountBase" DECIMAL(12,2) NOT NULL,
    "periodLabel" TEXT,
    "paymentMethod" "PaymentMethod",
    "note" TEXT,
    "movementId" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,

    CONSTRAINT "employee_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employees_restaurantId_active_idx" ON "employees"("restaurantId", "active");

-- CreateIndex
CREATE INDEX "employee_payments_restaurantId_paidAt_idx" ON "employee_payments"("restaurantId", "paidAt");

-- CreateIndex
CREATE INDEX "employee_payments_employeeId_idx" ON "employee_payments"("employeeId");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_payments" ADD CONSTRAINT "employee_payments_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_payments" ADD CONSTRAINT "employee_payments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
