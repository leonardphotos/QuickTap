-- CreateEnum
CREATE TYPE "ClubWaitlistStatus" AS ENUM ('WAITING', 'OFFERED', 'ENROLLED', 'CANCELLED');

-- AlterTable
ALTER TABLE "club_class_groups" ADD COLUMN     "programId" TEXT;

-- CreateTable
CREATE TABLE "club_programs" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "club_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_waitlist_entries" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "ClubWaitlistStatus" NOT NULL DEFAULT 'WAITING',
    "note" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "club_waitlist_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "club_programs_restaurantId_active_idx" ON "club_programs"("restaurantId", "active");

-- CreateIndex
CREATE INDEX "club_waitlist_entries_restaurantId_status_idx" ON "club_waitlist_entries"("restaurantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "club_waitlist_entries_groupId_studentId_key" ON "club_waitlist_entries"("groupId", "studentId");

-- AddForeignKey
ALTER TABLE "club_programs" ADD CONSTRAINT "club_programs_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_waitlist_entries" ADD CONSTRAINT "club_waitlist_entries_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_waitlist_entries" ADD CONSTRAINT "club_waitlist_entries_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "club_class_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_waitlist_entries" ADD CONSTRAINT "club_waitlist_entries_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "club_students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_class_groups" ADD CONSTRAINT "club_class_groups_programId_fkey" FOREIGN KEY ("programId") REFERENCES "club_programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
