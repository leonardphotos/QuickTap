ALTER TABLE "public"."platform_settings"
  ADD COLUMN "ramblayEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "manualPaymentEnabled" BOOLEAN NOT NULL DEFAULT true;
