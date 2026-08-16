-- Observaciones de receta por producto + detalle fiscal (base imponible / IVA) de las compras.

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "recipeNotes" TEXT;

-- AlterTable
ALTER TABLE "movements" ADD COLUMN     "taxableBase" DECIMAL(12,2),
ADD COLUMN     "ivaBase" DECIMAL(12,2);
