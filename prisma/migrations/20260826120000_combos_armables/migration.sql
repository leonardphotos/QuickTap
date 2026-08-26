-- Combos armables: el combo apunta a sus platos componentes; cada instancia se arma con los
-- modificadores del propio plato al ordenar.
CREATE TABLE "combo_components" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "componentProductId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "priority" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "combo_components_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "combo_components_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "combo_components_componentProductId_fkey" FOREIGN KEY ("componentProductId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "combo_components_productId_componentProductId_key" ON "combo_components"("productId", "componentProductId");
CREATE INDEX "combo_components_restaurantId_idx" ON "combo_components"("restaurantId");
