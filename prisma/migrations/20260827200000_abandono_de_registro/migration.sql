-- Embudo de registro: quién llega a la pasarela y no termina, con lo que alcanzó a escribir
-- (nunca la contraseña) para poder contactarlo después.
CREATE TABLE "registration_attempts" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'START',
    "businessType" TEXT,
    "shopRubro" TEXT,
    "restaurantName" TEXT,
    "slug" TEXT,
    "whatsappPhone" TEXT,
    "ownerName" TEXT,
    "email" TEXT,
    "landingQuery" TEXT,
    "lastError" TEXT,
    "completedAt" TIMESTAMP(3),
    "restaurantId" TEXT,
    "contactedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "registration_attempts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "registration_attempts_sessionId_key" ON "registration_attempts"("sessionId");
CREATE INDEX "registration_attempts_stage_createdAt_idx" ON "registration_attempts"("stage", "createdAt");
CREATE INDEX "registration_attempts_completedAt_idx" ON "registration_attempts"("completedAt");
