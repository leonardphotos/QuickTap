-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "whatsappBotWelcomeEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "whatsappBotWelcomeMessage" TEXT;
