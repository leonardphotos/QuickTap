-- Sillas por mesa: se dibujan alrededor de la mesa en el plano del salón.
ALTER TABLE "tables" ADD COLUMN "seats" INTEGER NOT NULL DEFAULT 4;

-- Las rectangulares ya estaban pensadas para 6 personas (ver comentario de planShape).
UPDATE "tables" SET "seats" = 6 WHERE "planShape" = 'RECTANGLE';
