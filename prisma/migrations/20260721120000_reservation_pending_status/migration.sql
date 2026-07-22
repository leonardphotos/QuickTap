-- AlterEnum: nuevo estado PENDING, para el flujo de aceptar/cancelar reservas
ALTER TYPE "ReservationStatus" ADD VALUE 'PENDING';
