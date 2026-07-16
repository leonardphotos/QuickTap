-- Teléfono del cliente, capturado al abrir la cuenta de mesa (ahora
-- obligatorio a nivel de aplicación, usado también por "Enviar vía WhatsApp").
ALTER TABLE "table_sessions" ADD COLUMN "customerPhone" TEXT;
