-- Valores nuevos del enum, SOLOS en su propio archivo: Postgres no permite usar un valor de
-- enum en la misma transacción que lo creó, y `prisma migrate deploy` envuelve cada archivo en
-- una. Las columnas que los usan van en la migración siguiente.
ALTER TYPE "ReservationStatus" ADD VALUE IF NOT EXISTS 'SEATED';
ALTER TYPE "ReservationStatus" ADD VALUE IF NOT EXISTS 'NO_SHOW';
