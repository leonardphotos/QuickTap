-- El Plan Elite deja de contratarse solo: el prospecto pide que lo llame un asesor.
-- La fila se guarda siempre, aunque el aviso por WhatsApp no salga (número desconectado o
-- fuera de la ventana horaria del máster) — ver notifiedAt.
CREATE TYPE "AdvisorLeadStatus" AS ENUM ('PENDING', 'CONTACTED', 'CLOSED', 'DISCARDED');

CREATE TABLE "advisor_leads" (
  "id"           TEXT NOT NULL,
  "contactName"  TEXT NOT NULL,
  "phone"        TEXT NOT NULL,
  "address"      TEXT NOT NULL,
  "businessName" TEXT NOT NULL,
  "plan"         "SubscriptionPlan" NOT NULL DEFAULT 'ELITE',
  "status"       "AdvisorLeadStatus" NOT NULL DEFAULT 'PENDING',
  "notes"        TEXT,
  "notifiedAt"   TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "advisor_leads_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "advisor_leads_status_createdAt_idx" ON "advisor_leads" ("status", "createdAt");
