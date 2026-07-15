-- Restablecer contraseña con un código de 6 dígitos enviado al correo.
ALTER TABLE "users" ADD COLUMN "resetCodeHash" TEXT;
ALTER TABLE "users" ADD COLUMN "resetCodeExpiresAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "resetCodeAttempts" INTEGER NOT NULL DEFAULT 0;
