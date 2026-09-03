-- Consumo del servicio de IA: una fila por llamada a Gemini.
-- Dato de la plataforma, no de un inquilino: la factura la paga QuickTap. `restaurantId` va
-- sin llave foránea a propósito, para que el gasto sobreviva al borrado del restaurante.
CREATE TABLE "ai_usage" (
    "id" TEXT NOT NULL,
    "operacion" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "restaurantId" TEXT,
    "restaurante" TEXT,
    "entrada" INTEGER NOT NULL DEFAULT 0,
    "salida" INTEGER NOT NULL DEFAULT 0,
    "razonamiento" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "ms" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_usage_createdAt_idx" ON "ai_usage"("createdAt");
CREATE INDEX "ai_usage_operacion_createdAt_idx" ON "ai_usage"("operacion", "createdAt");
CREATE INDEX "ai_usage_restaurantId_createdAt_idx" ON "ai_usage"("restaurantId", "createdAt");
