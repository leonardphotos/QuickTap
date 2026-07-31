-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "whatsappBotConnectedNumber" TEXT,
ADD COLUMN     "whatsappBotEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "whatsappBotNotifyReady" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "whatsappBotNotifyReceived" BOOLEAN NOT NULL DEFAULT true;
