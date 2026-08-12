-- Un club pasa de tener UNA tienda vinculada a hasta 4. El tope lo valida el
-- servicio (MAX_LINKED_STORES en club-link.service.ts), no la tabla: es una
-- regla de negocio, no una propiedad del esquema.
--
-- El @unique de clubId era justo lo que lo limitaba a una; se reemplaza por un
-- unique compuesto que sigue impidiendo vincular DOS VECES la misma tienda.

-- DropIndex
DROP INDEX "club_restaurant_links_clubId_key";

-- AlterTable
ALTER TABLE "club_restaurant_links" ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "club_restaurant_links_clubId_idx" ON "club_restaurant_links"("clubId");

-- CreateIndex
CREATE UNIQUE INDEX "club_restaurant_links_clubId_restaurantId_key" ON "club_restaurant_links"("clubId", "restaurantId");
