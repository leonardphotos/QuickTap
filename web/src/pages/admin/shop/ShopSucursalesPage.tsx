import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Building2, Plus, Store } from 'lucide-react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { CURRENCY_SYMBOLS, formatBase, formatBsAbsolute } from '@/utils/format';
import { TextureButton } from '@/components/ui/texture-button';
import { MetricCard } from '@/components/admin/MetricCard';
import { AddBranchDialog } from '../SucursalesPage';
import { BranchComparisonSection } from '@/components/admin/BranchComparisonSection';

interface Branch {
  id: string;
  name: string;
  whatsappPhone: string | null;
  baseCurrency: 'USD' | 'EUR';
  isActive: boolean;
  createdAt: string;
}

interface BranchSales {
  branchId: string;
  name: string;
  isMain: boolean;
  ordersCount: number;
  totalBase: string;
  totalBs: string;
}

type Range = 'day' | 'week' | 'month' | 'year';
const RANGE_LABELS: Record<Range, string> = { day: 'Hoy', week: 'Semana', month: 'Este mes', year: 'Este año' };

const card = 'rounded-2xl border border-brand-950/10 bg-white shadow-sm';

/**
 * Sucursales de un LOCAL (plan Elite Shop): crear otra sede (con el catálogo copiado y su
 * propio inventario y caja), cambiar de sede, y ver las ventas consolidadas por sede. Reusa
 * la API de sucursales de restaurante — el backend distingue el vertical (ShopSale en vez de
 * Order) al consolidar, ver branch.service.ts#salesRows.
 */
export default function ShopSucursalesPage() {
  const { restaurant, switchToBranch } = useAuth();
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const [branches, setBranches] = useState<Branch[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [range, setRange] = useState<Range>('month');
  const [rows, setRows] = useState<BranchSales[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .get('/branches')
      .then((res) => setBranches(res.data.data))
      .catch((err) => setError(err.response?.data?.error ?? 'No se pudieron cargar las sucursales.'));
  }, []);

  useEffect(load, [load]);

  useEffect(() => {
    api
      .get('/branches/reports/sales', { params: { range } })
      .then((res) => setRows(res.data.data))
      .catch(() => setRows([]));
  }, [range, branches.length]);

  const totalBase = rows.reduce((acc, r) => acc + Number(r.totalBase), 0);
  const totalBs = rows.reduce((acc, r) => acc + Number(r.totalBs), 0);
  const totalSales = rows.reduce((acc, r) => acc + r.ordersCount, 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-brand-950">Sucursales</h1>
          <p className="mt-0.5 text-sm font-light text-brand-950/50">
            Cada sucursal tiene su propio inventario, caja y equipo. Aquí ves las ventas de todas juntas.
          </p>
        </div>
        <TextureButton variant="brand" size="default" className="!w-auto flex items-center gap-2" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" /> Agregar sucursal
        </TextureButton>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className={`${card} divide-y divide-brand-950/[0.06]`}>
        {branches.length === 0 ? (
          <div className="p-6 text-center">
            <Store className="mx-auto mb-2 h-6 w-6 text-brand-950/30" />
            <p className="text-sm font-medium text-brand-950">Todavía no tienes sucursales</p>
            <p className="mt-0.5 text-[13px] font-light text-brand-950/50">
              Crea la primera: puedes copiarle el catálogo y los precios de esta sede.
            </p>
          </div>
        ) : (
          branches.map((b) => (
            <div key={b.id} className="flex items-center justify-between gap-3 p-4">
              <div className="flex min-w-0 items-center gap-3">
                <Building2 className="h-4 w-4 shrink-0 text-brand-500" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-brand-950">{b.name}</p>
                  <p className="text-xs text-brand-950/50">
                    {b.whatsappPhone ?? 'Sin WhatsApp configurado'} · desde {new Date(b.createdAt).toLocaleDateString('es-VE')}
                  </p>
                </div>
              </div>
              <TextureButton variant="minimal" size="sm" className="!w-auto flex items-center gap-1.5" onClick={() => switchToBranch(b.id)}>
                Entrar <ArrowRight className="h-3.5 w-3.5" />
              </TextureButton>
            </div>
          ))
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(RANGE_LABELS) as Range[]).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              range === r ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/50'
            }`}
          >
            {RANGE_LABELS[r]}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard title="Sedes" value={String(rows.length || branches.length + 1)} caption="principal + sucursales" />
        <MetricCard title={`Ventas · ${RANGE_LABELS[range]}`} value={String(totalSales)} caption="tickets de todas las sedes" />
        <MetricCard title="Total vendido" value={formatBase(totalBase, symbol)} valueTone="success" caption={formatBsAbsolute(totalBs)} />
      </div>

      <div className={`${card} overflow-hidden`}>
        <div className="flex items-center gap-3 border-b border-brand-950/[0.06] px-5 py-2 text-[11px] font-medium uppercase tracking-wide text-brand-950/40">
          <span className="flex-1">Sede</span>
          <span className="w-20 shrink-0 text-right">Ventas</span>
          <span className="w-28 shrink-0 text-right">Total</span>
        </div>
        <div className="divide-y divide-brand-950/[0.06]">
          {rows.map((r) => (
            <div key={r.branchId} className="flex items-center gap-3 px-5 py-2.5 text-sm">
              <span className="min-w-0 flex-1 truncate font-medium text-brand-950">
                {r.name}
                {r.isMain && <span className="ml-1.5 text-[11px] font-normal text-brand-950/40">(principal)</span>}
              </span>
              <span className="w-20 shrink-0 text-right text-brand-950/70">{r.ordersCount}</span>
              <span className="w-28 shrink-0 text-right font-semibold text-brand-950">{formatBase(r.totalBase, symbol)}</span>
            </div>
          ))}
        </div>
      </div>

      {branches.length > 0 && (
        <div>
          <p className="mb-3 text-sm font-medium text-brand-950/70">Comparativa administrativa entre sedes</p>
          <BranchComparisonSection />
        </div>
      )}

      {showAdd && (
        <AddBranchDialog
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            setShowAdd(false);
            load();
          }}
        />
      )}
    </div>
  );
}
