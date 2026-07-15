-- Marca el restaurante de demostración para excluirlo del reporte financiero
-- del Dashboard maestro.
ALTER TABLE "restaurants" ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false;
