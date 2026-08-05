-- Corrige el nombre mal escrito "embase" -> "envase" (español correcto para
-- envase/caja/bolsa). RENAME COLUMN preserva los datos existentes (a
-- diferencia de un DROP + ADD, que los perdería).
ALTER TABLE "orders" RENAME COLUMN "embaseFeeBase" TO "envaseFeeBase";
