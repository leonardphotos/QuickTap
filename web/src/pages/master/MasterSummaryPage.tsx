import { useEffect, useState } from 'react';
import { masterApi } from '@/api/client';
import { formatBase, formatBsAbsolute } from '@/utils/format';

interface Summary {
  month: { revenueBs: string; revenueUsd: string };
  allTime: { revenueBs: string; revenueUsd: string };
  restaurantOwners: number;
  totalRestaurants: number;
  activeRestaurants: number;
}

export default function MasterSummaryPage() {
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    masterApi.get('/master/summary').then((res) => setSummary(res.data.data));
  }, []);

  if (!summary) return <p className="text-brand-950/50 font-light">Cargando…</p>;

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-semibold tracking-tight text-brand-950">Resumen</h1>

      <div>
        <p className="text-sm font-medium text-brand-950/70 mb-3">Ingresos del mes</p>
        <div className="grid grid-cols-2 gap-4">
          <RevenueCard label="En bolívares" value={formatBsAbsolute(summary.month.revenueBs)} />
          <RevenueCard label="En dólares (restaurantes en USD)" value={formatBase(summary.month.revenueUsd, '$')} />
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-brand-950/70 mb-3">Ingresos históricos</p>
        <div className="grid grid-cols-2 gap-4">
          <RevenueCard label="En bolívares" value={formatBsAbsolute(summary.allTime.revenueBs)} />
          <RevenueCard label="En dólares (restaurantes en USD)" value={formatBase(summary.allTime.revenueUsd, '$')} />
        </div>
      </div>

      <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-6 grid grid-cols-3 gap-4 text-center">
        <Stat label="Dueños de restaurante" value={summary.restaurantOwners} />
        <Stat label="Restaurantes activos" value={summary.activeRestaurants} />
        <Stat label="Restaurantes totales" value={summary.totalRestaurants} />
      </div>
    </div>
  );
}

function RevenueCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-6">
      <p className="text-2xl font-semibold text-brand-950">{value}</p>
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
