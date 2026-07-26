import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { masterApi } from '@/api/client';
import { formatBase, formatBsAbsolute } from '@/utils/format';
import { SpeedGauge } from '@/components/master/SpeedGauge';
import { ServerHealthCard } from '@/components/master/ServerHealthCard';
import { VpsCapacityBar } from '@/components/master/VpsCapacityBar';
import { QuickTapRevenueDialog } from '@/components/master/QuickTapRevenueDialog';
import { MaskedAmount } from '@/components/master/MaskedAmount';
import { MoneyVisibilityToggle } from '@/components/master/MoneyVisibilityToggle';

interface Summary {
  month: { revenueBs: string; revenueUsd: string };
  quickTap: { revenueBs: string; revenueUsd: string };
  restaurantOwners: number;
  totalRestaurants: number;
  activeRestaurants: number;
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

  if (!summary) return <p className="text-brand-950/50 font-light">Cargando…</p>;

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-semibold tracking-tight text-brand-950">Resumen</h1>

      <VpsCapacityBar />

      <div className="flex flex-col sm:flex-row gap-4 items-stretch">
        <div className="sm:w-64 sm:shrink-0">
          <SpeedGauge />
        </div>
        <div className="flex-1">
          <ServerHealthCard />
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-3">
          <p className="text-sm font-medium text-brand-950/70">Ingreso general de restaurantes</p>
          <MoneyVisibilityToggle />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <RevenueCard label="En bolívares" value={formatBsAbsolute(summary.month.revenueBs)} />
          <RevenueCard label="En dólares (restaurantes en USD)" value={formatBase(summary.month.revenueUsd, '$')} />
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={() => setShowQuickTapDetail(true)}
            className="flex items-center gap-1.5 text-sm font-medium text-brand-950/70 hover:text-brand-500 transition-colors"
          >
            Ingresos de QuickTap
            <span className="text-xs font-normal text-brand-950/40">— ver detalle</span>
          </button>
          <MoneyVisibilityToggle />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <RevenueCard label="En bolívares" value={formatBsAbsolute(summary.quickTap.revenueBs)} />
          <RevenueCard label="En dólares" value={formatBase(summary.quickTap.revenueUsd, '$')} />
        </div>
      </div>

      {showQuickTapDetail && (
        <QuickTapRevenueDialog onClose={() => setShowQuickTapDetail(false)} onChanged={loadSummary} />
      )}

      <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-6 grid grid-cols-3 gap-4 text-center">
        <Stat label="Dueños de restaurante" value={summary.restaurantOwners} />
        <Stat label="Restaurantes activos" value={summary.activeRestaurants} />
        <Stat label="Restaurantes totales" value={summary.totalRestaurants} />
      </div>

      <div>
        <p className="text-sm font-medium text-brand-950/70 mb-3">Pendientes por atender</p>
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
      </div>
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

function RevenueCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-6">
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
