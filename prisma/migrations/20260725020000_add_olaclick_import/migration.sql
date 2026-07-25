-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "externalSource" TEXT,
ADD COLUMN     "externalSourceId" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "externalSource" TEXT,
ADD COLUMN     "externalSourceId" TEXT,
ADD COLUMN     "importedImageUrl" TEXT;

-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "olaclickApiKeyEncrypted" TEXT,
ADD COLUMN     "olaclickLastSyncAt" TIMESTAMP(3),
ADD COLUMN     "olaclickLastSyncSummary" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "categories_restaurantId_externalSource_externalSourceId_key" ON "categories"("restaurantId", "externalSource", "externalSourceId");

-- CreateIndex
CREATE UNIQUE INDEX "products_restaurantId_externalSource_externalSourceId_key" ON "products"("restaurantId", "externalSource", "externalSourceId");

