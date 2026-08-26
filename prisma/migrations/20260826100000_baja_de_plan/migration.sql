-- Baja de plan programada: aplica en la próxima renovación, sin devolución del período pagado.
ALTER TABLE "restaurants" ADD COLUMN "pendingDowngradePlan" "SubscriptionPlan";
