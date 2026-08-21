-- Cambios de administrador que esperan el visto bueno del dueño (ver modelo ApprovalRequest).
CREATE TYPE "ApprovalAction" AS ENUM ('PRODUCT_PRICE', 'PRODUCT_DELETE', 'PRICE_RAISE', 'STOCK_ADJUST', 'SALE_RETURN');
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDIENTE', 'APROBADA', 'RECHAZADA');

ALTER TABLE "restaurants" ADD COLUMN "approvalActions" JSONB;

CREATE TABLE "approval_requests" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "action" "ApprovalAction" NOT NULL,
    "payload" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDIENTE',
    "requestedByUserId" TEXT NOT NULL,
    "requestedByUserName" TEXT NOT NULL,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "appliedAt" TIMESTAMP(3),
    "applyError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "approval_requests_restaurantId_status_idx" ON "approval_requests"("restaurantId", "status");

ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
