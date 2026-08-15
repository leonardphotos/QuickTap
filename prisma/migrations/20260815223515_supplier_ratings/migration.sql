-- CreateTable
CREATE TABLE "supplier_ratings" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "quality" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "punctuality" INTEGER NOT NULL,
    "service" INTEGER NOT NULL,
    "comment" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplier_ratings_restaurantId_supplierId_idx" ON "supplier_ratings"("restaurantId", "supplierId");

-- AddForeignKey
ALTER TABLE "supplier_ratings" ADD CONSTRAINT "supplier_ratings_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_ratings" ADD CONSTRAINT "supplier_ratings_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

