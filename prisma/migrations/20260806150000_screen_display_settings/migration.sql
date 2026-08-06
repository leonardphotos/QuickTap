-- Ajustes -> Pantalla: qué muestra el carrusel del rol SCREEN.

ALTER TABLE "restaurants" ADD COLUMN "screenDisplayMode" TEXT NOT NULL DEFAULT 'ALL',
ADD COLUMN "screenCategoryIds" JSONB,
ADD COLUMN "screenProductIds" JSONB,
ADD COLUMN "screenPageIntervalSec" INTEGER NOT NULL DEFAULT 8,
ADD COLUMN "screenItemsPerPage" INTEGER NOT NULL DEFAULT 4;
