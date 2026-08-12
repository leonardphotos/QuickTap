import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/api/client';
import type { BillingCycle, PurchasablePlan } from '@/utils/plans';
import { PlanCards } from './PlanCards';
import { SinglePlanCard } from './SinglePlanCard';

type Vertical = 'restaurant' | 'shop' | 'club';

const VERTICAL_LABEL: Record<Vertical, string> = {
  restaurant: 'Restaurantes',
  shop: 'Locales Comerciales',
  club: 'Canchas',
};

const VERTICAL_SUBTITLE: Record<Vertical, string> = {
  restaurant: 'Elige el plan que se ajuste al tamaño de tu restaurante.',
  shop: 'Un solo plan con todos los beneficios de QuickTap Shop.',
  club: 'Un solo plan con todos los beneficios de QuickTap Club.',
};

const SHOP_DEFAULT_FEATURES = [
  'Punto Pago: sube tu QR de Pago Móvil una sola vez y cóbralo con el monto en Bs y la tasa del día en una sola pantalla',
  'Inventario con foto obligatoria, variantes de talla/color o stock básico',
  'Punto de venta con escaneo por cámara o lector, y carrito flotante con el total en $ y Bs',
  'Acepta Efectivo Bs/$, Pago Móvil, Zelle, Binance y ventas fiadas (completas o con abono)',
  'Caja: apertura, cierre y arqueo con historial de informes',
  'Ingresos por método de pago, margen de utilidad y productos más vendidos',
  'Alertas de stock bajo y productos próximos a vencer',
  'Directorio de clientes y roles de equipo (Dueño, Administrador, Cajero)',
];

const CLUB_DEFAULT_FEATURES = [
  'Calendario de canchas en vivo, con reservas y bloqueos por mantenimiento/clases/torneos',
  'Acceso por QR/código: el jugador entra a su reserva sin pasar por recepción',
  'Tablet de cancha: pedidos a la tienda del club y cobro con el monto en Bs y la tasa del día',
  'Hasta 4 tiendas vinculadas, cada una cobrando lo suyo con su propio método de pago',
  'Academia: programas, horarios y lista de espera',
  'Caja: apertura, cierre y arqueo con historial de informes',
  'Directorio de jugadores y roles de equipo (Dueño, Administrador, Cajero, Cancha)',
];

export function PricingSection() {
  const navigate = useNavigate();
  const [rateBs, setRateBs] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('MONTHLY');
  const [vertical, setVertical] = useState<Vertical>('restaurant');

  useEffect(() => {
    api
      .get('/public/exchange-rate')
      .then((res) => setRateBs(res.data.data?.USD?.rateBs ?? null))
      .catch(() => setRateBs(null));
  }, []);

  // El pago solo se hace ya con la cuenta creada (ver BillingPage): aquí solo
  // se elige el plan y se manda a registrar, llevando la elección en la URL
  // para que el panel la retome automáticamente después de crear la cuenta.
  function choosePlan(plan: PurchasablePlan) {
    const params = new URLSearchParams({ plan, cycle: billingCycle });
    navigate(`/empezar?${params.toString()}`);
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-20 w-full">
      <div className="text-center mb-10">
        <h2 className="text-3xl sm:text-4xl font-bold text-brand-950">Precios y planes</h2>
        <p className="text-brand-950/60 mt-2 font-light">{VERTICAL_SUBTITLE[vertical]}</p>
        <p className="text-brand-950/50 text-sm mt-1 font-light">
          Primero creas tu cuenta gratis, luego completas el pago desde tu panel.
        </p>
        {rateBs && <p className="text-xs text-brand-950/40 mt-1">Precio en Bs referencial según tasa BCV del día.</p>}

        <div className="inline-flex items-center gap-1 rounded-full border border-brand-950/10 bg-brand-950/[0.03] p-1 mt-6">
          {(['restaurant', 'shop', 'club'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVertical(v)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                vertical === v ? 'bg-white text-brand-950 shadow-sm' : 'text-brand-950/50 hover:text-brand-950/80'
              }`}
            >
              {VERTICAL_LABEL[v]}
            </button>
          ))}
        </div>
      </div>

      {vertical === 'shop' && (
        <SinglePlanCard
          plan="SHOP"
          defaultName="QuickTap Shop"
          defaultSubtitle="Todos los beneficios de QuickTap para tiendas, ropa, calzado, ferreterías, farmacias y más"
          defaultFeatures={SHOP_DEFAULT_FEATURES}
          rateBs={rateBs}
          billingCycle={billingCycle}
          onBillingCycleChange={setBillingCycle}
          onChoosePlan={choosePlan}
        />
      )}
      {vertical === 'club' && (
        <SinglePlanCard
          plan="CLUB"
          defaultName="QuickTap Club"
          defaultSubtitle="Todos los beneficios de QuickTap para canchas y clubes deportivos"
          defaultFeatures={CLUB_DEFAULT_FEATURES}
          rateBs={rateBs}
          billingCycle={billingCycle}
          onBillingCycleChange={setBillingCycle}
          onChoosePlan={choosePlan}
        />
      )}
      {vertical === 'restaurant' && (
        <PlanCards rateBs={rateBs} billingCycle={billingCycle} onBillingCycleChange={setBillingCycle} onChoosePlan={choosePlan} />
      )}
    </div>
  );
}
