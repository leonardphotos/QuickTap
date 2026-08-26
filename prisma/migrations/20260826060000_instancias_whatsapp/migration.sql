-- Instancias de WhatsApp por negocio (Evolution API); restaurantId null = la de la plataforma.
CREATE TABLE "wa_instances" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT,
    "instanceName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DISCONNECTED',
    "phone" TEXT,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "autoPaused" BOOLEAN NOT NULL DEFAULT false,
    "pendingAcks" INTEGER NOT NULL DEFAULT 0,
    "lastAckAt" TIMESTAMP(3),
    "lastSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "wa_instances_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "wa_instances_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "wa_instances_restaurantId_key" ON "wa_instances"("restaurantId");
CREATE UNIQUE INDEX "wa_instances_instanceName_key" ON "wa_instances"("instanceName");
