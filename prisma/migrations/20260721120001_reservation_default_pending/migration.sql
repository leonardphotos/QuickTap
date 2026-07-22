-- AlterTable: las reservas nuevas quedan PENDING hasta que Cajero/Admin las acepte
ALTER TABLE "reservations" ALTER COLUMN "status" SET DEFAULT 'PENDING';
