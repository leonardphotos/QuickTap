-- AlterTable: cómo se cobra un producto (SIMPLE = precio único, VARIANTS = el cliente elige entre variants)
ALTER TABLE "products" ADD COLUMN "pricingMode" TEXT NOT NULL DEFAULT 'SIMPLE';

-- AlterTable order_items: quita el array de texto libre "modifiers" (nunca tuvo UI, siempre vacío
-- en producción), agrega snapshot de la variante elegida y una relación real a los modificadores.
ALTER TABLE "order_items" DROP COLUMN "modifiers";
ALTER TABLE "order_items" ADD COLUMN "variantName" TEXT;

-- CreateTable: categorías de modificadores (reutilizables entre productos)
CREATE TABLE "modifier_categories" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "allowMultiple" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modifier_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable: modificadores (opciones dentro de una categoría)
CREATE TABLE "modifiers" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceBase" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "costBase" DECIMAL(12,2),
    "discountBase" DECIMAL(12,2),
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable: asociación producto <-> categoría de modificadores
CREATE TABLE "product_modifier_categories" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "modifierCategoryId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_modifier_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable: variantes de un producto (cuando pricingMode = VARIANTS)
CREATE TABLE "product_variants" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceBase" DECIMAL(12,2) NOT NULL,
    "packagingFeeBase" DECIMAL(12,2),
    "costBase" DECIMAL(12,2),
    "discountBase" DECIMAL(12,2),
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable: modificadores elegidos en un ítem del pedido (snapshot nombre/precio)
CREATE TABLE "order_item_modifiers" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceBase" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "order_item_modifiers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "modifier_categories_restaurantId_idx" ON "modifier_categories"("restaurantId");
CREATE INDEX "modifiers_restaurantId_categoryId_idx" ON "modifiers"("restaurantId", "categoryId");
CREATE UNIQUE INDEX "product_modifier_categories_productId_modifierCategoryId_key" ON "product_modifier_categories"("productId", "modifierCategoryId");
CREATE INDEX "product_variants_restaurantId_productId_idx" ON "product_variants"("restaurantId", "productId");
CREATE INDEX "order_item_modifiers_orderItemId_idx" ON "order_item_modifiers"("orderItemId");

-- AddForeignKey
ALTER TABLE "modifier_categories" ADD CONSTRAINT "modifier_categories_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "modifiers" ADD CONSTRAINT "modifiers_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "modifiers" ADD CONSTRAINT "modifiers_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "modifier_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_modifier_categories" ADD CONSTRAINT "product_modifier_categories_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_modifier_categories" ADD CONSTRAINT "product_modifier_categories_modifierCategoryId_fkey" FOREIGN KEY ("modifierCategoryId") REFERENCES "modifier_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_item_modifiers" ADD CONSTRAINT "order_item_modifiers_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
