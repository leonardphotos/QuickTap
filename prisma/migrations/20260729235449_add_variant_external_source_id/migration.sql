-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN     "externalSourceId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_productId_externalSourceId_key" ON "product_variants"("productId", "externalSourceId");

