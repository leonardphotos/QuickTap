-- Interruptor de "Bloquear cuando no hay stock" (Inventario → Stock de productos).
-- Apagado por defecto: es el comportamiento que los restaurantes tienen hoy (se puede vender
-- de más). Encendido, no se deja comandar más de lo que queda disponible.
ALTER TABLE "restaurants" ADD COLUMN "blockOrdersWithoutStock" BOOLEAN NOT NULL DEFAULT false;
