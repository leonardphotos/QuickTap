-- Interruptor por club: si es false, la tablet deja de ofrecer "Pagar" y solo
-- muestra el detalle de cada cuenta y su monto al acabarse el tiempo.
ALTER TABLE "restaurants" ADD COLUMN "clubTabletPaymentsEnabled" BOOLEAN NOT NULL DEFAULT true;
