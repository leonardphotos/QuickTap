-- AlterTable
ALTER TABLE "products" ADD COLUMN     "recipeApplyIva" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "recipeApplyService" BOOLEAN NOT NULL DEFAULT true;
