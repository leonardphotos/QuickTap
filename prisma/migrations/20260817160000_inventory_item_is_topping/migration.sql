-- Marca insumos como "Topping" para el nuevo picker curado al crear un modificador.

-- AlterTable
ALTER TABLE "inventory_items" ADD COLUMN "isTopping" BOOLEAN NOT NULL DEFAULT false;
