-- Control por lotes: cuánto queda de cada entrada y su número.
ALTER TABLE "shop_purchases" ADD COLUMN "remainingQty" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "shop_purchases" ADD COLUMN "lotNumber" INTEGER NOT NULL DEFAULT 0;

-- Las compras que ya existían se consideran consumidas: no hay forma de saber cuánto quedaba
-- de cada una, y darles saldo completo inflaría el inventario con mercancía que ya se vendió.
UPDATE "shop_purchases" SET "remainingQty" = 0;
