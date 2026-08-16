-- Estructura de costo por producto (Administración → Estructura de costo):
-- config del restaurante (% fijos/variables + utilidad objetivo) y snapshot por producto.

-- CreateTable
CREATE TABLE "cost_structure_configs" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "targetNetMarginPercent" DECIMAL(5,2) NOT NULL DEFAULT 20,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cost_structure_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_cost_structures" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "materials" JSONB NOT NULL,
    "materialsCostBase" DECIMAL(12,2) NOT NULL,
    "variablePercent" DECIMAL(6,2) NOT NULL,
    "fixedPercent" DECIMAL(6,2) NOT NULL,
    "salePriceBase" DECIMAL(12,2) NOT NULL,
    "variableCostBase" DECIMAL(12,2) NOT NULL,
    "fixedCostBase" DECIMAL(12,2) NOT NULL,
    "totalCostBase" DECIMAL(12,2) NOT NULL,
    "netProfitBase" DECIMAL(12,2) NOT NULL,
    "netMarginPercent" DECIMAL(6,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_cost_structures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cost_structure_configs_restaurantId_key" ON "cost_structure_configs"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "product_cost_structures_productId_key" ON "product_cost_structures"("productId");

-- CreateIndex
CREATE INDEX "product_cost_structures_restaurantId_idx" ON "product_cost_structures"("restaurantId");

-- AddForeignKey
ALTER TABLE "cost_structure_configs" ADD CONSTRAINT "cost_structure_configs_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_cost_structures" ADD CONSTRAINT "product_cost_structures_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_cost_structures" ADD CONSTRAINT "product_cost_structures_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
