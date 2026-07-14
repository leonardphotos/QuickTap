-- CreateEnum
CREATE TYPE "PlatformAdminRole" AS ENUM ('ADMIN', 'MANAGER');

-- AlterTable
ALTER TABLE "platform_admins" ADD COLUMN "role" "PlatformAdminRole" NOT NULL DEFAULT 'ADMIN';
