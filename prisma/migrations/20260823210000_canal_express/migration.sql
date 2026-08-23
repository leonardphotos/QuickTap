-- Canal Express: venta de mostrador al paso, sin mesa y sin datos del cliente.
-- ALTER TYPE ... ADD VALUE va en su propia migración: Postgres no deja usar el
-- valor nuevo en la misma transacción en que se agrega.
ALTER TYPE "OrderChannel" ADD VALUE IF NOT EXISTS 'EXPRESS';
