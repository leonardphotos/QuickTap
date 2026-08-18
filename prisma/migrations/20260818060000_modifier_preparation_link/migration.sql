ALTER TABLE "modifiers" ADD COLUMN "preparationId" TEXT;
CREATE INDEX "modifiers_preparationId_idx" ON "modifiers"("preparationId");
ALTER TABLE "modifiers" ADD CONSTRAINT "modifiers_preparationId_fkey" FOREIGN KEY ("preparationId") REFERENCES "preparations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
