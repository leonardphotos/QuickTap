-- Distingue las zonas que registró el sistema solo (estimando el precio a partir de las
-- vecinas) de las que dibujó el restaurante. Las automáticas nunca le ganan a una dibujada a
-- mano cuando se solapan, y no alimentan las estimaciones de otras direcciones.
ALTER TABLE "delivery_zones" ADD COLUMN "isAuto" BOOLEAN NOT NULL DEFAULT false;

-- Las que ya existen se reconocen por el nombre que les puso el propio sistema.
UPDATE "delivery_zones" SET "isAuto" = true WHERE "name" LIKE 'Zona automática%';
