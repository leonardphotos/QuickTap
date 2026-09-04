-- El cargo por servicio dejó de ser global: cada restaurante decide en cuáles
-- canales de pedido aplica. El default preserva exactamente el comportamiento previo.
ALTER TABLE "restaurants"
ADD COLUMN "serviceChargeChannels" TEXT[] NOT NULL
DEFAULT ARRAY['DINE_IN', 'DELIVERY', 'PICKUP', 'BAR', 'EXPRESS']::TEXT[];
