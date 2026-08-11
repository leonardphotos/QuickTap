-- CreateEnum
CREATE TYPE "ClubClassType" AS ENUM ('GROUP', 'PRIVATE', 'CLINIC');

-- CreateEnum
CREATE TYPE "ClubCoachPayType" AS ENUM ('FIXED_PER_SESSION', 'HOURLY', 'COMMISSION_ON_CONSUMED', 'COMMISSION_ON_ENROLLMENT', 'MIXED');

-- CreateEnum
CREATE TYPE "ClubGroupStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ENDED');

-- CreateEnum
CREATE TYPE "ClubClassSessionStatus" AS ENUM ('SCHEDULED', 'NEEDS_COURT', 'PENDING_PAYMENT', 'CONFIRMED', 'DONE', 'CANCELLED', 'RELEASED');

-- CreateEnum
CREATE TYPE "ClubBillingMode" AS ENUM ('MONTHLY', 'PACKAGE', 'PER_CLASS');

-- CreateEnum
CREATE TYPE "ClubEnrollmentStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CANCELLED', 'FINISHED');

-- CreateEnum
CREATE TYPE "ClubAttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'JUSTIFIED', 'MAKEUP');

-- CreateEnum
CREATE TYPE "ClubCreditReason" AS ENUM ('PACKAGE_PURCHASE', 'CLASS_CONSUMED', 'CANCELLATION_TOKEN', 'EXPIRED', 'MANUAL_ADJUST', 'REFUND');

-- CreateEnum
CREATE TYPE "ClubAcademyPaymentKind" AS ENUM ('PACKAGE', 'MONTHLY', 'SINGLE_CLASS', 'ENROLLMENT_FEE');

-- CreateEnum
CREATE TYPE "ClubChargeStatus" AS ENUM ('PENDING', 'PAID', 'WAIVED', 'OVERDUE');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'COACH';

-- CreateTable
CREATE TABLE "club_academy_settings" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "defaultReleaseHoursBefore" INTEGER NOT NULL DEFAULT 12,
    "cancelDeadlineHours" INTEGER NOT NULL DEFAULT 24,
    "maxMakeupPerMonth" INTEGER NOT NULL DEFAULT 2,
    "creditExpiryDays" INTEGER DEFAULT 90,
    "enrollmentOpensDaysBefore" INTEGER NOT NULL DEFAULT 30,
    "privateHoldMinutes" INTEGER NOT NULL DEFAULT 30,
    "enforceLevelOnEnroll" BOOLEAN NOT NULL DEFAULT true,
    "notifyCoachOnEnroll" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "club_academy_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_coaches" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "userId" TEXT,
    "employeeId" TEXT,
    "levelMin" DECIMAL(2,1),
    "levelMax" DECIMAL(2,1),
    "bio" TEXT,
    "photoUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "payType" "ClubCoachPayType" NOT NULL DEFAULT 'FIXED_PER_SESSION',
    "payAmountBase" DECIMAL(12,2),
    "commissionPercent" DECIMAL(5,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "club_coaches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_coach_availability" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,

    CONSTRAINT "club_coach_availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_coach_time_off" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "club_coach_time_off_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_class_groups" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "levelMin" DECIMAL(2,1) NOT NULL,
    "levelMax" DECIMAL(2,1) NOT NULL,
    "classType" "ClubClassType" NOT NULL DEFAULT 'GROUP',
    "capacityMin" INTEGER NOT NULL DEFAULT 2,
    "capacityMax" INTEGER NOT NULL DEFAULT 4,
    "seasonStart" TIMESTAMP(3) NOT NULL,
    "seasonEnd" TIMESTAMP(3),
    "priceMonthlyBase" DECIMAL(12,2),
    "pricePerClassBase" DECIMAL(12,2),
    "packagePriceBase" DECIMAL(12,2),
    "packageClasses" INTEGER,
    "releaseHoursBefore" INTEGER,
    "status" "ClubGroupStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "club_class_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_class_slots" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "courtId" TEXT,

    CONSTRAINT "club_class_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_class_sessions" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "blockId" TEXT,
    "groupId" TEXT,
    "coachId" TEXT NOT NULL,
    "courtId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "classType" "ClubClassType" NOT NULL,
    "capacityMin" INTEGER NOT NULL,
    "capacityMax" INTEGER NOT NULL,
    "releaseHoursBefore" INTEGER NOT NULL,
    "payType" "ClubCoachPayType" NOT NULL,
    "payAmountBase" DECIMAL(12,2),
    "commissionPercent" DECIMAL(5,2),
    "coachFeeBase" DECIMAL(12,2),
    "status" "ClubClassSessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "holdExpiresAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "notifiedCoachAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "club_class_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_students" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "level" DECIMAL(2,1),
    "birthDate" TIMESTAMP(3),
    "guardianName" TEXT,
    "guardianPhone" TEXT,
    "accessToken" TEXT NOT NULL,
    "medicalNotes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "club_students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_enrollments" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "billingMode" "ClubBillingMode" NOT NULL DEFAULT 'MONTHLY',
    "priceBase" DECIMAL(12,2) NOT NULL,
    "billingDay" INTEGER,
    "status" "ClubEnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "levelOverrideReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "club_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_attendance" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "ClubAttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "consumedValueBase" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "creditEntryId" TEXT,
    "markedByUserId" TEXT,
    "markedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "club_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_class_packages" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "totalClasses" INTEGER NOT NULL,
    "priceBase" DECIMAL(12,2) NOT NULL,
    "pricePerClassBase" DECIMAL(12,2) NOT NULL,
    "groupId" TEXT,
    "slotId" TEXT,
    "holdsSeat" BOOLEAN NOT NULL DEFAULT true,
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "club_class_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_class_credit_entries" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" "ClubCreditReason" NOT NULL,
    "packageId" TEXT,
    "sessionId" TEXT,
    "note" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "club_class_credit_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_academy_payments" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "kind" "ClubAcademyPaymentKind" NOT NULL,
    "packageId" TEXT,
    "chargeId" TEXT,
    "sessionId" TEXT,
    "amountBase" DECIMAL(12,2) NOT NULL,
    "exchangeRate" DECIMAL(12,4) NOT NULL,
    "amountBs" DECIMAL(14,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "referenceNumber" TEXT,
    "proofImageUrl" TEXT,
    "receivedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "club_academy_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_academy_charges" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "amountBase" DECIMAL(12,2) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "ClubChargeStatus" NOT NULL DEFAULT 'PENDING',
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "club_academy_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_coach_payouts" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "sessionsCount" INTEGER NOT NULL,
    "amountBase" DECIMAL(12,2) NOT NULL,
    "movementId" TEXT,
    "employeePaymentId" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "club_coach_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "club_academy_settings_restaurantId_key" ON "club_academy_settings"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "club_coaches_userId_key" ON "club_coaches"("userId");

-- CreateIndex
CREATE INDEX "club_coaches_restaurantId_active_idx" ON "club_coaches"("restaurantId", "active");

-- CreateIndex
CREATE INDEX "club_coaches_employeeId_idx" ON "club_coaches"("employeeId");

-- CreateIndex
CREATE INDEX "club_coach_availability_coachId_weekday_idx" ON "club_coach_availability"("coachId", "weekday");

-- CreateIndex
CREATE INDEX "club_coach_time_off_coachId_startsAt_idx" ON "club_coach_time_off"("coachId", "startsAt");

-- CreateIndex
CREATE INDEX "club_class_groups_restaurantId_status_idx" ON "club_class_groups"("restaurantId", "status");

-- CreateIndex
CREATE INDEX "club_class_groups_coachId_idx" ON "club_class_groups"("coachId");

-- CreateIndex
CREATE INDEX "club_class_slots_groupId_weekday_idx" ON "club_class_slots"("groupId", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "club_class_sessions_blockId_key" ON "club_class_sessions"("blockId");

-- CreateIndex
CREATE INDEX "club_class_sessions_restaurantId_startsAt_idx" ON "club_class_sessions"("restaurantId", "startsAt");

-- CreateIndex
CREATE INDEX "club_class_sessions_coachId_startsAt_idx" ON "club_class_sessions"("coachId", "startsAt");

-- CreateIndex
CREATE INDEX "club_class_sessions_restaurantId_status_idx" ON "club_class_sessions"("restaurantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "club_class_sessions_groupId_startsAt_key" ON "club_class_sessions"("groupId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "club_students_customerId_key" ON "club_students"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "club_students_accessToken_key" ON "club_students"("accessToken");

-- CreateIndex
CREATE INDEX "club_students_restaurantId_active_idx" ON "club_students"("restaurantId", "active");

-- CreateIndex
CREATE INDEX "club_enrollments_restaurantId_status_idx" ON "club_enrollments"("restaurantId", "status");

-- CreateIndex
CREATE INDEX "club_enrollments_groupId_status_idx" ON "club_enrollments"("groupId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "club_enrollments_studentId_groupId_startsAt_key" ON "club_enrollments"("studentId", "groupId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "club_attendance_creditEntryId_key" ON "club_attendance"("creditEntryId");

-- CreateIndex
CREATE INDEX "club_attendance_studentId_idx" ON "club_attendance"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "club_attendance_sessionId_studentId_key" ON "club_attendance"("sessionId", "studentId");

-- CreateIndex
CREATE INDEX "club_class_packages_restaurantId_studentId_idx" ON "club_class_packages"("restaurantId", "studentId");

-- CreateIndex
CREATE INDEX "club_class_packages_slotId_expiresAt_idx" ON "club_class_packages"("slotId", "expiresAt");

-- CreateIndex
CREATE INDEX "club_class_credit_entries_restaurantId_studentId_idx" ON "club_class_credit_entries"("restaurantId", "studentId");

-- CreateIndex
CREATE INDEX "club_class_credit_entries_studentId_createdAt_idx" ON "club_class_credit_entries"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "club_academy_payments_restaurantId_createdAt_idx" ON "club_academy_payments"("restaurantId", "createdAt");

-- CreateIndex
CREATE INDEX "club_academy_payments_studentId_idx" ON "club_academy_payments"("studentId");

-- CreateIndex
CREATE INDEX "club_academy_charges_restaurantId_status_idx" ON "club_academy_charges"("restaurantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "club_academy_charges_enrollmentId_periodYear_periodMonth_key" ON "club_academy_charges"("enrollmentId", "periodYear", "periodMonth");

-- CreateIndex
CREATE INDEX "club_coach_payouts_restaurantId_coachId_idx" ON "club_coach_payouts"("restaurantId", "coachId");

-- AddForeignKey
ALTER TABLE "club_academy_settings" ADD CONSTRAINT "club_academy_settings_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_coaches" ADD CONSTRAINT "club_coaches_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_coaches" ADD CONSTRAINT "club_coaches_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_coaches" ADD CONSTRAINT "club_coaches_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_coach_availability" ADD CONSTRAINT "club_coach_availability_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "club_coaches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_coach_time_off" ADD CONSTRAINT "club_coach_time_off_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "club_coaches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_class_groups" ADD CONSTRAINT "club_class_groups_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_class_groups" ADD CONSTRAINT "club_class_groups_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "club_coaches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_class_slots" ADD CONSTRAINT "club_class_slots_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "club_class_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_class_slots" ADD CONSTRAINT "club_class_slots_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "club_courts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_class_sessions" ADD CONSTRAINT "club_class_sessions_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_class_sessions" ADD CONSTRAINT "club_class_sessions_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "club_court_blocks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_class_sessions" ADD CONSTRAINT "club_class_sessions_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "club_class_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_class_sessions" ADD CONSTRAINT "club_class_sessions_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "club_coaches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_class_sessions" ADD CONSTRAINT "club_class_sessions_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "club_courts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_students" ADD CONSTRAINT "club_students_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_students" ADD CONSTRAINT "club_students_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_enrollments" ADD CONSTRAINT "club_enrollments_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_enrollments" ADD CONSTRAINT "club_enrollments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "club_students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_enrollments" ADD CONSTRAINT "club_enrollments_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "club_class_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_attendance" ADD CONSTRAINT "club_attendance_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "club_class_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_attendance" ADD CONSTRAINT "club_attendance_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "club_students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_attendance" ADD CONSTRAINT "club_attendance_markedByUserId_fkey" FOREIGN KEY ("markedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_attendance" ADD CONSTRAINT "club_attendance_creditEntryId_fkey" FOREIGN KEY ("creditEntryId") REFERENCES "club_class_credit_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_class_packages" ADD CONSTRAINT "club_class_packages_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_class_packages" ADD CONSTRAINT "club_class_packages_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "club_students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_class_packages" ADD CONSTRAINT "club_class_packages_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "club_class_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_class_packages" ADD CONSTRAINT "club_class_packages_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "club_class_slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_class_credit_entries" ADD CONSTRAINT "club_class_credit_entries_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_class_credit_entries" ADD CONSTRAINT "club_class_credit_entries_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "club_students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_class_credit_entries" ADD CONSTRAINT "club_class_credit_entries_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "club_class_packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_class_credit_entries" ADD CONSTRAINT "club_class_credit_entries_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "club_class_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_academy_payments" ADD CONSTRAINT "club_academy_payments_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_academy_payments" ADD CONSTRAINT "club_academy_payments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "club_students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_academy_payments" ADD CONSTRAINT "club_academy_payments_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "club_class_packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_academy_payments" ADD CONSTRAINT "club_academy_payments_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "club_academy_charges"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_academy_payments" ADD CONSTRAINT "club_academy_payments_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "club_class_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_academy_payments" ADD CONSTRAINT "club_academy_payments_receivedByUserId_fkey" FOREIGN KEY ("receivedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_academy_charges" ADD CONSTRAINT "club_academy_charges_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_academy_charges" ADD CONSTRAINT "club_academy_charges_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "club_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_coach_payouts" ADD CONSTRAINT "club_coach_payouts_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_coach_payouts" ADD CONSTRAINT "club_coach_payouts_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "club_coaches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
