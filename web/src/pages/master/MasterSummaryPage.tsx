import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { masterApi } from '@/api/client';
import { formatBase, formatBsAbsolute } from '@/utils/format';
import { ServerHealthCard } from '@/components/master/ServerHealthCard';
import { VpsCapacityBar } from '@/components/master/VpsCapacityBar';
import { QuickTapRevenueDialog } from '@/components/master/QuickTapRevenueDialog';
import { MaskedAmount } from '@/components/master/MaskedAmount';
import { MoneyVisibilityToggle } from '@/components/master/MoneyVisibilityToggle';
import { LiveOrdersCounter } from '@/components/master/LiveOrdersCounter';
import { MASTER_CONFIG_LINKS, MASTER_OPERATION_LINKS } from './master-nav';

// Colores rotativos para los tiles de "Accesos rápidos" — solo distinguen visualmente una sección
// de otra, no tienen significado propio (mismo criterio que el panel del restaurante).
const SHORTCUT_COLORS = [
  'bg-brand-500/10 text-brand-600',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-sky-100 text-sky-700',
  'bg-violet-100 text-violet-700',
  'bg-rose-100 text-rose-700',
  'bg-teal-100 text-teal-700',
  'bg-orange-100 text-orange-700',
];

// El Resumen ya es la pantalla actual: no tiene sentido como acceso rápido a sí misma.
const SHORTCUTS = [...MASTER_OPERATION_LINKS.filter((l) => l.to !== '/master/summary'), ...MASTER_CONFIG_LINKS];

interface Summary {
  month: { revenueBs: string; revenueUsd: string };
  quickTap: { revenueBs: string; revenueUsd: string };
  restaurantOwners: number;
  totalRestaurants: number;
  activeRestaurants: number;
  ordersAllTime: number;
  ordersAllTimeUsd: string;
  ordersAllTimeBs: string;
}

interface PlanRequestRow {
  id: string;
  kind: 'SIGNUP' | 'RENEWAL';
  plan: string;
  priceUsd: string;
  contactName: string;
  restaurantName: string | null;
  createdAt: string;
  restaurant: { name: string } | null;
}

interface QrNfcRequestRow {
  id: string;
  quantity: number;
  totalPriceUsd: string;
  contactName: string;
  createdAt: string;
  restaurant: { name: string };
}

export default function MasterSummaryPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [proofs, setProofs] = useState<PlanRequestRow[] | null>(null);
  const [qrNfc, setQrNfc] = useState<QrNfcRequestRow[] | null>(null);
  const [showQuickTapDetail, setShowQuickTapDetail] = useState(false);

  function loadSummary() {
    masterApi.get('/master/summary').then((res) => setSummary(res.data.data));
  }

  useEffect(() => {
    loadSummary();
    Promise.all([
      masterApi.get('/master/plan-requests', { params: { kind: 'SIGNUP', status: 'PENDING' } }),
      masterApi.get('/master/plan-requests', { params: { kind: 'RENEWAL', status: 'PENDING' } }),
    ]).then(([signup, renewal]) => setProofs([...signup.data.data, ...renewal.data.data]));
    masterApi.get('/master/qr-nfc-requests', { params: { status: 'PENDING' } }).then((res) => setQrNfc(res.data.data));
  }, []);

  // Contador por destino, para que el tile avise sin tener que entrar a mirar.
  const pendingByPath: Record<string, number | undefined> = {
    '/master/proofs': proofs?.length,
    '/master/qrnfc-requests': qrNfc?.length,
  };

  if (!summary) return <p className="text-brand-950/50 font-light">Cargando…</p>;

  return (
    <div className="space-y-10">
      <h1 className="text-3xl font-semibold tracking-tight text-brand-950">Resumen</h1>

      <LiveOrdersCounter
        initial={summary.ordersAllTime}
        initialUsd={summary.ordersAllTimeUsd}
        initialBs={summary.ordersAllTimeBs}
      />

      {/* 1. Accesos rápidos — lo primero, para saltar a cualquier sección sin buscar en la barra. */}
      <section>
        <h2 className="text-sm font-semibold text-brand-950/70 mb-3">Accesos rápidos</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {SHORTCUTS.map((l, i) => {
            const pending = pendingByPath[l.to];
            return (
              <Link
                key={l.to}
                to={l.to}
                className="relative flex flex-col items-center gap-2 rounded-2xl border border-brand-950/[0.07] bg-white p-4 text-center shadow-sm transition-colors hover:border-brand-500/40"
              >
                <span
                  className={`flex h-11 w-11 items-center justify-center rounded-2xl ${SHORTCUT_COLORS[i % SHORTCUT_COLORS.length]}`}
                >
                  <l.icon className="h-5 w-5" />
                </span>
                <span className="text-[11.5px] font-semibold leading-tight text-brand-950">{l.label}</span>
                {pending !== undefined && pending > 0 && (
                  <span className="absolute right-2 top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1.5 text-[10px] font-bold text-white">
                    {pending}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </section>

      {/* 2. Pendientes por atender — lo accionable va antes que lo informativo. */}
      <section>
        <h2 className="text-sm font-semibold text-brand-950/70 mb-3">Pendientes por atender</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <PendingCard
            title="Comprobantes de pago"
            to="/master/proofs"
            items={
              proofs?.map((p) => ({
                id: p.id,
                primary: `${p.contactName} · ${p.restaurant?.name ?? p.restaurantName ?? 'sin restaurante'}`,
                secondary: (
                  <>
                    {p.plan} · <MaskedAmount value={`$${p.priceUsd}`} /> · {new Date(p.createdAt).toLocaleDateString('es-VE')}
                  </>
                ),
              })) ?? null
            }
            emptyLabel="Sin comprobantes pendientes."
          />
          <PendingCard
            title="Solicitudes QR/NFC"
            to="/master/qrnfc-requests"
            items={
              qrNfc?.map((q) => ({
                id: q.id,
                primary: `${q.contactName} · ${q.restaurant.name}`,
                secondary: (
                  <>
                    {q.quantity} unidades · <MaskedAmount value={`$${q.totalPriceUsd}`} /> ·{' '}
                    {new Date(q.createdAt).toLocaleDateString('es-VE')}
                  </>
                ),
              })) ?? null
            }
            emptyLabel="Sin solicitudes pendientes."
          />
        </div>
      </section>

      {/* 3. Ingresos — los dos bloques juntos bajo un solo encabezado y un solo interruptor de
             visibilidad (antes cada uno traía el suyo, repetido). */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-semibold text-brand-950/70">Ingresos del mes</h2>
          <MoneyVisibilityToggle />
        </div>
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-950/40 mb-3">De los restaurantes</p>
            <div className="grid grid-cols-2 gap-4">
              <RevenueFigure label="En bolívares" value={formatBsAbsolute(summary.month.revenueBs)} />
              <RevenueFigure label="En dólares" value={formatBase(summary.month.revenueUsd, '$')} />
            </div>
          </div>

          <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-5">
            <button
              onClick={() => setShowQuickTapDetail(true)}
              className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-950/40 transition-colors hover:text-brand-500"
            >
              De QuickTap
              <span className="text-[10px] font-medium normal-case tracking-normal text-brand-500">ver detalle</span>
            </button>
            <div className="grid grid-cols-2 gap-4">
              <RevenueFigure label="En bolívares" value={formatBsAbsolute(summary.quickTap.revenueBs)} />
              <RevenueFigure label="En dólares" value={formatBase(summary.quickTap.revenueUsd, '$')} />
            </div>
          </div>
        </div>
      </section>

      {showQuickTapDetail && (
        <QuickTapRevenueDialog onClose={() => setShowQuickTapDetail(false)} onChanged={loadSummary} />
      )}

      {/* 4. Conteos generales. */}
      <section>
        <h2 className="text-sm font-semibold text-brand-950/70 mb-3">Locales</h2>
        <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-6 grid grid-cols-3 gap-4 text-center">
          <Stat label="Dueños de restaurante" value={summary.restaurantOwners} />
          <Stat label="Restaurantes activos" value={summary.activeRestaurants} />
          <Stat label="Restaurantes totales" value={summary.totalRestaurants} />
        </div>
      </section>

      {/* 5. Infraestructura al final: es lo que menos se mira en el día a día — antes abría la
             pantalla y empujaba lo accionable hacia abajo. */}
      <section>
        <h2 className="text-sm font-semibold text-brand-950/70 mb-3">Servidor</h2>
        <div className="space-y-4">
          <VpsCapacityBar />
          <ServerHealthCard />
        </div>
      </section>
    </div>
  );
}

function PendingCard({
  title,
  to,
  items,
  emptyLabel,
}: {
  title: string;
  to: string;
  items: { id: string; primary: string; secondary: ReactNode }[] | null;
  emptyLabel: string;
}) {
  return (
    <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="font-medium text-brand-950 flex items-center gap-2">
          {title}
          {items && items.length > 0 && (
            <span className="text-xs font-semibold bg-brand-500 text-white rounded-full h-5 min-w-5 px-1.5 flex items-center justify-center">
              {items.length}
            </span>
          )}
        </p>
        <Link to={to} className="text-xs font-medium text-brand-500 hover:underline shrink-0">
          Ver todo
        </Link>
      </div>

      {items === null && <p className="text-xs text-brand-950/40 font-light">Cargando…</p>}
      {items?.length === 0 && <p className="text-xs text-brand-950/40 font-light">{emptyLabel}</p>}

      <ul className="space-y-2.5">
        {items?.slice(0, 4).map((it) => (
          <li key={it.id} className="text-sm">
            <p className="text-brand-950 truncate">{it.primary}</p>
            <p className="text-xs text-brand-950/50 font-light">{it.secondary}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RevenueFigure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-2xl font-semibold text-brand-950">
        <MaskedAmount value={value} />
      </p>
      <p className="text-xs text-brand-950/50 font-light mt-1">{label}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-2xl font-semibold text-brand-950">{value}</p>
      <p className="text-xs text-brand-950/50 font-light">{label}</p>
    </div>
  );
}
